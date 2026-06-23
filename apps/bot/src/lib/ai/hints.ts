import type { RequestHints } from '@repo/ai';
import { getUserCustomization } from '@repo/db/queries';
import type { Message, Thread } from 'chat';
import { slack } from '@/lib/chat';
import { resolveChannelName, resolveWorkspaceName } from '@/lib/slack/names';

export async function requestHints({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<RequestHints> {
  const channelId = slack.channelIdFromThreadId(thread.id);
  const { channel: rawChannelId } = slack.decodeThreadId(thread.id);
  const [channel, workspace, customization] = await Promise.all([
    resolveChannelName(rawChannelId),
    resolveWorkspaceName(),
    getUserCustomization(message.author.userId).catch(() => null),
  ]);
  return {
    channel: {
      id: channelId,
      name: channel,
    },
    customization,
    messageId: message.id,
    workspace,
    threadId: thread.id,
    time: new Date().toISOString(),
  };
}
