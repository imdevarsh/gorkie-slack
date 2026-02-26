import type { SetStatusParams, SlackMessageContext } from '~/types';
import { contextChannel, contextRootTs } from '~/utils/slack-event';

export function setStatus(
  context: SlackMessageContext,
  params: SetStatusParams
): Promise<unknown> {
  const channelId = contextChannel(context);
  const threadTs = contextRootTs(context);
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
