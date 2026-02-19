import type { Session } from 'sandbox-agent';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { showFileInputSchema } from '~/lib/validators/sandbox';
import type { SlackMessageContext } from '~/types';
import type { ResolvedSandboxSession } from './session';
import { showFile } from './show-file';

interface SessionUpdatePayload {
  sessionUpdate?: string;
  status?: string;
  title?: string;
  toolCallId?: string;
  rawInput?: { description?: string } & Record<string, unknown>;
  rawOutput?: Record<string, unknown>;
  content?: { text?: string } | string;
}

function readUpdate(payload: unknown): SessionUpdatePayload | null {
  return (
    (
      payload as {
        params?: {
          update?: SessionUpdatePayload;
        };
      }
    ).params?.update ?? null
  );
}

function handleShowFileTool(params: {
  update: SessionUpdatePayload;
  runtime: ResolvedSandboxSession;
  context: SlackMessageContext;
  ctxId: string;
}): void {
  const { update, runtime, context, ctxId } = params;

  const candidateInput = update.rawInput ?? update.rawOutput?.details;
  const parsed = showFileInputSchema.safeParse(candidateInput);
  if (!parsed.success) {
    logger.debug(
      {
        ctxId,
        rawInput: update.rawInput ?? null,
        rawOutput: update.rawOutput ?? null,
      },
      '[subagent] showFile handler skipped: invalid payload'
    );
    return;
  }

  showFile({ input: parsed.data, runtime, context, ctxId }).catch(
    (error: unknown) => {
      logger.debug({ error, ctxId }, '[subagent] showFile handler failed');
    }
  );
}

function handleCompletedTool(params: {
  update: SessionUpdatePayload;
  toolName: string;
  runtime: ResolvedSandboxSession;
  context: SlackMessageContext;
  ctxId: string;
}): void {
  const { update, toolName, runtime, context, ctxId } = params;

  switch (toolName) {
    case 'showFile': {
      handleShowFileTool({ update, runtime, context, ctxId });
      return;
    }
    default:
      return;
  }
}

function handleTools(params: {
  update: SessionUpdatePayload;
  runtime: ResolvedSandboxSession;
  context: SlackMessageContext;
  ctxId: string;
  toolByCall: Map<string, string>;
}): boolean {
  const { update, runtime, context, ctxId, toolByCall } = params;

  if (update.sessionUpdate === 'tool_call') {
    const toolName =
      typeof update.title === 'string' && update.title.trim().length > 0
        ? update.title.trim()
        : 'unknown';
    if (typeof update.toolCallId === 'string') {
      toolByCall.set(update.toolCallId, toolName);
    }
    logger.info(
      { ctxId, tool: toolName, input: update.rawInput ?? null },
      '[subagent] Tool started'
    );
    return true;
  }

  if (update.sessionUpdate !== 'tool_call_update') {
    return false;
  }

  const title =
    typeof update.title === 'string' && update.title.trim().length > 0
      ? update.title.trim()
      : null;
  const toolName =
    (typeof update.toolCallId === 'string'
      ? toolByCall.get(update.toolCallId)
      : null) ??
    title ??
    'unknown';
  const status = update.status ?? 'unknown';

  if (status === 'completed' && typeof update.toolCallId === 'string') {
    toolByCall.delete(update.toolCallId);
  }

  logger[status === 'failed' ? 'warn' : 'info'](
    {
      ctxId,
      tool: toolName,
      status,
      input: update.rawInput ?? null,
      output: update.rawOutput ?? null,
    },
    '[subagent] Tool update'
  );

  if (status !== 'completed') {
    return true;
  }

  handleCompletedTool({ update, toolName, runtime, context, ctxId });

  return true;
}

export function subscribeEvents(params: {
  session: Session;
  runtime: ResolvedSandboxSession;
  context: SlackMessageContext;
  ctxId: string;
  stream: unknown[];
}): () => void {
  const { session, runtime, context, ctxId, stream } = params;
  let lastStatus: string | null = null;
  const toolByCall = new Map<string, string>();

  return session.onEvent((event) => {
    stream.push(event.payload);

    if (event.sender !== 'agent') {
      return;
    }

    const update = readUpdate(event.payload);
    if (!update) {
      return;
    }

    const liveStatus = update.rawInput?.status;
    if (typeof liveStatus === 'string' && liveStatus.trim().length > 0) {
      const nextStatus = liveStatus.trim().slice(0, 49);
      if (nextStatus !== lastStatus) {
        lastStatus = nextStatus;
        setStatus(context, {
          status: nextStatus,
          loading: true,
        }).catch((error: unknown) => {
          logger.debug({ error, ctxId }, '[subagent] Status update skipped');
        });
      }
    }

    handleTools({ update, runtime, context, ctxId, toolByCall });
  });
}

export function getResponse(stream: unknown[]): string | undefined {
  function getText(content: SessionUpdatePayload['content']): string | null {
    const text = typeof content === 'string' ? content : content?.text;
    if (typeof text !== 'string') {
      return null;
    }

    return text.length > 0 ? text : null;
  }

  let chunks: string[] = [];
  let lastMessage: string[] = [];

  for (const payload of stream) {
    const update = readUpdate(payload);
    if (!update?.sessionUpdate) {
      continue;
    }

    if (update.sessionUpdate === 'agent_message_chunk') {
      const text = getText(update.content);
      if (text) {
        chunks.push(text);
      }
    } else if (chunks.length > 0) {
      lastMessage = chunks;
      chunks = [];
    }
  }

  if (chunks.length > 0) {
    lastMessage = chunks;
  }

  const summary = lastMessage.join('').trim();
  if (summary.length > 0) {
    return summary;
  }
}
