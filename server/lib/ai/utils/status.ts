import type { SetStatusParams, SlackMessageContext } from '~/types';

export function setStatus(
  context: SlackMessageContext,
  params: SetStatusParams
): Promise<unknown> {
  const threadTs =
    (context.event as { thread_ts?: string }).thread_ts ?? context.event.ts;
  const { status, loading } = params;
  const payload: {
    channel_id: string;
    thread_ts: string;
    status: string;
    loading_messages?: string[];
  } = {
    channel_id: context.event.channel,
    thread_ts: threadTs,
    status,
  };

  if (Array.isArray(loading)) {
    payload.loading_messages = loading;
  } else if (loading) {
    payload.loading_messages = [status];
  }

  return context.client.assistant.threads.setStatus(payload).catch(() => {
    // ignore status update failures
  });
}
