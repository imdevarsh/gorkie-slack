import type { RequestHints } from '@repo/ai';
import { getUserCustomization } from '@repo/db/queries';
import { getTime } from '@repo/utils/time';
import type { Message, Thread } from 'chat';
import { resolveChannelName, resolveServerName } from '@/lib/slack/names';
import { rawSlackThreadFrom } from '@/lib/slack/thread';

export async function requestHints({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<RequestHints> {
  const slackThread = rawSlackThreadFrom(thread);
  const channelId = slackThread?.channel ?? thread.channelId;
  const [channel, server, customization] = await Promise.all([
    resolveChannelName(channelId),
    resolveServerName(),
    getUserCustomization(message.author.userId).catch(() => null),
  ]);
  return {
    channel,
    channelId,
    customization,
    messageId: message.id,
    model: 'openai/gpt-5.4-mini',
    server,
    threadId: thread.id,
    time: getTime(),
  };
}
