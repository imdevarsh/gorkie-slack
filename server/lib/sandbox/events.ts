import logger from '~/lib/logger';
import { showFileInputSchema } from '~/lib/validators/sandbox';
import type { SlackMessageContext } from '~/types';
import type { AgentSessionEvent } from '~/types/sandbox/rpc';
import type { RetryEvent, ToolEndEvent, ToolStartEvent } from '~/types/sandbox/events';
import { nonEmptyTrimString } from '~/utils/text';
import type { PiRpcClient } from './rpc';
import type { ResolvedSandboxSession } from './session';
import { showFile } from './show-file';

function handleShowFileTool(params: {
  result: unknown;
  runtime: ResolvedSandboxSession;
  context: SlackMessageContext;
  ctxId: string;
}): void {
  const { result, runtime, context, ctxId } = params;

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

export interface SubscribeEventsParams {
  client: PiRpcClient;
  context: SlackMessageContext;
  ctxId: string;
  events: AgentSessionEvent[];
  onRetry?: (event: RetryEvent) => void | Promise<void>;
  onToolEnd?: (event: ToolEndEvent) => void | Promise<void>;
  onToolStart?: (event: ToolStartEvent) => void | Promise<void>;
  runtime: ResolvedSandboxSession;
}

export function subscribeEvents(params: SubscribeEventsParams): () => void {
  const {
    client,
    runtime,
    context,
    ctxId,
    events,
    onToolStart,
    onToolEnd,
    onRetry,
  } = params;

  return client.onEvent((event) => {
    try {
      events.push(event);

      if (event.type === 'auto_retry_start') {
        const { attempt, maxAttempts, delayMs, errorMessage } = event;
        logger.warn(
          { ctxId, attempt, maxAttempts, delayMs, errorMessage },
          '[subagent] Auto-retry started'
        );
        onRetry?.({ attempt, maxAttempts, delayMs, errorMessage });
        return;
      }

      if (event.type === 'tool_execution_start') {
        const { toolName, args, toolCallId } = event;
        logger.info({ ctxId, tool: toolName, args }, '[subagent] Tool started');
        const status = nonEmptyTrimString(args?.status)?.slice(0, 49);
        onToolStart?.({ toolName, toolCallId, args, status });
        return;
      }

      if (event.type === 'tool_execution_end') {
        const { toolName, result, isError, toolCallId } = event;
        logger[isError ? 'warn' : 'info'](
          { ctxId, tool: toolName, isError, result },
          '[subagent] Tool completed'
        );
        onToolEnd?.({ toolName, toolCallId, isError, result });

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

export function getResponse(events: AgentSessionEvent[]): string | undefined {
  const chunks: string[] = [];

  for (const event of events) {
    if (event.type !== 'message_update') {
      continue;
    }
    const { assistantMessageEvent } = event;
    if (
      assistantMessageEvent.type === 'text_delta' &&
      typeof assistantMessageEvent.delta === 'string'
    ) {
      chunks.push(assistantMessageEvent.delta);
    }
  }

  const text = chunks.join('').trim();
  return text.length > 0 ? text : undefined;
}
