import type { RequestHints } from '@repo/ai';
import { getUserCustomization } from '@repo/db/queries';
import type { Message, Thread } from 'chat';
import { toRawChannelId } from '@/lib/slack/ids';
import { resolveChannelName, resolveWorkspaceName } from '@/lib/slack/names';

export async function requestHints({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<RequestHints> {
  const channelId = toRawChannelId(thread.id);
  const [channel, workspace, customization] = await Promise.all([
    resolveChannelName(channelId),
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
