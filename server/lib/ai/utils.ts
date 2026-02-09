import type { StopCondition, ToolSet } from 'ai';
import { loadingMessages } from '~/config';
import type { SlackMessageContext } from '~/types';

export function setToolStatus(
  context: SlackMessageContext,
  status: string
): Promise<unknown> {
  const threadTs =
    (context.event as { thread_ts?: string }).thread_ts ?? context.event.ts;
  return context.client.assistant.threads
    .setStatus({
      channel_id: context.event.channel,
      thread_ts: threadTs,
      status,
      loading_messages: loadingMessages
    })
    .catch(() => {
      // ignore status update failures
    });
}

export function successToolCall<T extends ToolSet>(
  toolName: string
): StopCondition<T> {
  return ({ steps }) =>
    steps
      .at(-1)
      ?.toolResults?.some(
        (toolResult) =>
          toolResult.toolName === toolName &&
          (toolResult.output as { success?: boolean })?.success
      ) ?? false;
}
