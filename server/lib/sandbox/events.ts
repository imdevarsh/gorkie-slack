import type { Session } from 'sandbox-agent';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';

interface SessionUpdatePayload {
  sessionUpdate?: string;
  status?: string;
  title?: string;
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

function readTextContent(
  content: SessionUpdatePayload['content']
): string | null {
  if (typeof content === 'string') {
    const text = content.trim();
    return text.length > 0 ? text : null;
  }

  if (typeof content?.text === 'string') {
    const text = content.text.trim();
    return text.length > 0 ? text : null;
  }

  return null;
}

export function subscribeSandboxEvents(params: {
  session: Session;
  context: SlackMessageContext;
  ctxId: string;
  stream: unknown[];
}): () => void {
  const { session, context, ctxId, stream } = params;
  let lastStatus: string | null = null;

  return session.onEvent((event) => {
    stream.push(event.payload);

    if (event.sender !== 'agent') {
      return;
    }

    const update = readUpdate(event.payload);
    if (!update) {
      return;
    }

    const liveStatus = update.rawInput?.description;
    if (typeof liveStatus === 'string' && liveStatus.trim().length > 0) {
      const nextStatus = liveStatus.trim().slice(0, 50);
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

    if (update.sessionUpdate === 'tool_call') {
      logger.info(
        {
          ctxId,
          tool: update.title ?? 'unknown',
          input: update.rawInput ?? null,
        },
        '[subagent] Tool started'
      );
      return;
    }

    if (update.sessionUpdate === 'tool_call_update') {
      const level = update.status === 'failed' ? 'warn' : 'info';
      logger[level](
        {
          ctxId,
          tool: update.title ?? 'unknown',
          status: update.status ?? 'unknown',
          input: update.rawInput ?? null,
          output: update.rawOutput ?? null,
        },
        '[subagent] Tool update'
      );
    }
  });
}

export function summarizeSandboxStream(stream: unknown[]): string {
  let lastAgentMessage: string | null = null;
  const chunkParts: string[] = [];

  for (const payload of stream) {
    const update = readUpdate(payload);
    if (!update?.sessionUpdate) {
      continue;
    }

    if (update.sessionUpdate === 'agent_message') {
      const text = readTextContent(update.content);
      if (text) {
        lastAgentMessage = text;
      }
      continue;
    }

    if (update.sessionUpdate === 'agent_message_chunk') {
      const text = readTextContent(update.content);
      if (text) {
        chunkParts.push(text);
      }
    }
  }

  if (lastAgentMessage) {
    return lastAgentMessage.slice(0, 1500);
  }

  const chunkSummary = chunkParts.join('').trim();
  if (chunkSummary.length > 0) {
    return chunkSummary.slice(0, 1500);
  }

  const last = stream.at(-1);
  if (last === undefined) {
    return 'Task completed in sandbox.';
  }

  try {
    return JSON.stringify(last).slice(0, 1500);
  } catch {
    return 'Task completed in sandbox.';
  }
}
