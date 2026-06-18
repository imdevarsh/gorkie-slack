import type { RequestHints } from '@repo/ai';
import { getUserCustomization } from '@repo/db/queries';
import { getTime } from '@repo/utils/time';
import type { Message, Thread } from 'chat';
import { resolveChannelName, resolveServerName } from '@/lib/slack/names';
import { getThread } from '@/lib/slack/thread';

export async function requestHints({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<RequestHints> {
  const slackThread = getThread(thread);
  const channelId = slackThread?.channel ?? thread.channelId;
  const [channel, server, customization] = await Promise.all([
    resolveChannelName(channelId),
    resolveServerName(),
    getUserCustomization(message.author.userId).catch(() => null),
  ]);
  return {
    channel: {
      id: channelId,
      name: channel,
    },
    customization,
    messageId: message.id,
    server,
    threadId: thread.id,
    time: getTime(),
  };
}
