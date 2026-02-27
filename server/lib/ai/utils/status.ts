import type { SetStatusParams, SlackMessageContext } from '~/types';

export function setStatus(
  context: SlackMessageContext,
  params: SetStatusParams
): Promise<unknown> {
  const channelId = context.event.channel;
  const threadTs = context.event.thread_ts ?? context.event.ts;
  if (!(channelId && threadTs)) {
    return Promise.resolve();
  }

  const { status, loading } = params;
  const payload: {
    channel_id: string;
    thread_ts: string;
    status: string;
    loading_messages?: string[];
  } = {
    channel_id: channelId,
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
