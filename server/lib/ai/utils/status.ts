import type { ChatRuntimeContext } from '~/types';

type LoadingOption = boolean | string[];

interface SetStatusParams {
  loading?: LoadingOption;
  status: string;
}

export async function setStatus(
  context: ChatRuntimeContext,
  params: SetStatusParams
): Promise<void> {
  const { status, loading } = params;

  let loadingMessages: string[] | undefined;
  if (Array.isArray(loading)) {
    loadingMessages = loading;
  } else if (loading) {
    loadingMessages = [status];
  }

  await context.slack
    .setAssistantStatus(
      context.channelId,
      context.event.thread_ts ?? context.event.ts,
      status,
      loadingMessages
    )
    .catch(async () => {
      if (!status) {
        return;
      }
      await context.thread.startTyping(status).catch(() => {
        // ignore status update failures
      });
    });
}
