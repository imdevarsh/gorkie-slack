import logger from '~/lib/logger';
import { showFileInputSchema } from '~/lib/validators/sandbox';
import type { SlackMessageContext } from '~/types';
import type { AgentEvent } from '~/types/sandbox/rpc';
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
  onToolStart?: (input: {
    args: unknown;
    status?: string;
    toolCallId: string;
    toolName: string;
  }) => void | Promise<void>;
  onToolEnd?: (input: {
    isError: boolean;
    result: unknown;
    toolCallId: string;
    toolName: string;
  }) => void | Promise<void>;
}): () => void {
  const { client, runtime, context, ctxId, stream, onToolStart, onToolEnd } =
    params;

  return client.onEvent((event) => {
    try {
      stream.push(event);

      if (event.type === 'tool_execution_start') {
        const { toolName, args, toolCallId } = event as Extract<
          AgentEvent,
          { type: 'tool_execution_start' }
        >;
        logger.info({ ctxId, tool: toolName, args }, '[subagent] Tool started');

        const rawStatus = args?.status;
        const status =
          typeof rawStatus === 'string' && rawStatus.trim().length > 0
            ? rawStatus.trim().slice(0, 49)
            : undefined;
        void onToolStart?.({ toolName, toolCallId, args, status });
        return;
      }

      if (event.type === 'tool_execution_end') {
        const { toolName, result, isError, toolCallId } = event as Extract<
          AgentEvent,
          { type: 'tool_execution_end' }
        >;
        logger[isError ? 'warn' : 'info'](
          { ctxId, tool: toolName, isError, result },
          '[subagent] Tool completed'
        );
        void onToolEnd?.({ toolName, toolCallId, isError, result });

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
    const event = item as AgentEvent;
    if (event.type !== 'message_update') {
      continue;
    }

    const msgEvent = (event as Extract<AgentEvent, { type: 'message_update' }>)
      .assistantMessageEvent;
    if (msgEvent.type === 'text_delta' && typeof msgEvent.delta === 'string') {
      chunks.push(msgEvent.delta);
    }
  }

  const text = chunks.join('').trim();
  return text.length > 0 ? text : undefined;
}
