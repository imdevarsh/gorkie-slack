import type { Session } from 'sandbox-agent';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';

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

export function subscribeEvents(params: {
  session: Session;
  context: SlackMessageContext;
  ctxId: string;
  stream: unknown[];
}): () => void {
  const { session, context, ctxId, stream } = params;
  let lastStatus: string | null = null;
  const seenToolUpdates = new Set<string>();
  const toolNameByCallId = new Map<string, string>();

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

    if (update.sessionUpdate === 'tool_call') {
      const toolCallId =
        update.toolCallId ?? `unknown:${update.title ?? 'tool'}`;
      const toolName = update.title ?? 'unknown';
      toolNameByCallId.set(toolCallId, toolName);
      seenToolUpdates.add(`${toolCallId}:pending`);
      logger.info(
        {
          ctxId,
          tool: toolName,
          input: update.rawInput ?? null,
        },
        '[subagent] Tool started'
      );
      return;
    }

    if (update.sessionUpdate === 'tool_call_update') {
      const toolCallId =
        update.toolCallId ?? `unknown:${update.title ?? 'tool'}`;
      const toolName =
        toolNameByCallId.get(toolCallId) ?? update.title ?? 'unknown';
      const statusKey = `${toolCallId}:${update.status ?? 'unknown'}`;
      if (seenToolUpdates.has(statusKey)) {
        return;
      }
      seenToolUpdates.add(statusKey);

      const level = update.status === 'failed' ? 'warn' : 'info';
      logger[level](
        {
          ctxId,
          tool: toolName,
          status: update.status ?? 'unknown',
          input: update.rawInput ?? null,
          output: update.rawOutput ?? null,
        },
        '[subagent] Tool update'
      );
    }
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

  const chunks: string[] = [];

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
    }
  }

  const summary = chunks.join('').trim();
  if (summary.length > 0) {
    return summary;
  }
}
