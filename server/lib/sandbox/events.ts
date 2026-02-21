import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { showFileInputSchema } from '~/lib/validators/sandbox';
import type { SlackMessageContext } from '~/types';
import type { PiEvent, PiRpcClient } from './runtime';
import type { ResolvedSandboxSession } from './session';
import { showFile } from './show-file';

function handleShowFileTool(params: {
  result: unknown;
  runtime: ResolvedSandboxSession;
  context: SlackMessageContext;
  ctxId: string;
}): void {
  const { result, runtime, context, ctxId } = params;

  // showFile returns { content: [...], details: { path, title } }
  const details = (result as Record<string, unknown> | null)?.details;
  const parsed = showFileInputSchema.safeParse(details);
  if (!parsed.success) {
    logger.debug(
      { ctxId, result },
      '[subagent] showFile handler skipped: invalid result payload'
    );
    return;
  }

  showFile({ input: parsed.data, runtime, context, ctxId }).catch(
    (error: unknown) => {
      logger.debug({ error, ctxId }, '[subagent] showFile handler failed');
    }
  );
}

export function subscribeEvents(params: {
  client: PiRpcClient;
  runtime: ResolvedSandboxSession;
  context: SlackMessageContext;
  ctxId: string;
  stream: unknown[];
}): () => void {
  const { client, runtime, context, ctxId, stream } = params;
  let lastStatus: string | null = null;

  return client.onEvent((event) => {
    try {
      stream.push(event);

      if (event.type === 'tool_execution_start') {
        const { toolName, args } = event as Extract<
          PiEvent,
          { type: 'tool_execution_start' }
        >;
        logger.info({ ctxId, tool: toolName, args }, '[subagent] Tool started');

        const rawStatus = args?.status;
        if (typeof rawStatus === 'string' && rawStatus.trim().length > 0) {
          const nextStatus = rawStatus.trim().slice(0, 49);
          if (nextStatus !== lastStatus) {
            lastStatus = nextStatus;
            setStatus(context, { status: nextStatus, loading: true }).catch(
              (error: unknown) => {
                logger.debug(
                  { error, ctxId },
                  '[subagent] Status update skipped'
                );
              }
            );
          }
        }
        return;
      }

      if (event.type === 'tool_execution_end') {
        const { toolName, result, isError } = event as Extract<
          PiEvent,
          { type: 'tool_execution_end' }
        >;
        logger[isError ? 'warn' : 'info'](
          { ctxId, tool: toolName, isError, result },
          '[subagent] Tool completed'
        );

        if (toolName === 'showFile') {
          handleShowFileTool({ result, runtime, context, ctxId });
        }
      }
    } catch (error) {
      logger.warn(
        { error, ctxId },
        '[subagent] Failed to process session event'
      );
    }
  });
}

export function getResponse(stream: unknown[]): string | undefined {
  const chunks: string[] = [];

  for (const item of stream) {
    const event = item as PiEvent;
    if (event.type !== 'message_update') {
      continue;
    }

    const msgEvent = (event as Extract<PiEvent, { type: 'message_update' }>)
      .assistantMessageEvent;
    if (msgEvent.type === 'text_delta' && typeof msgEvent.delta === 'string') {
      chunks.push(msgEvent.delta);
    }
  }

  const text = chunks.join('').trim();
  return text.length > 0 ? text : undefined;
}
