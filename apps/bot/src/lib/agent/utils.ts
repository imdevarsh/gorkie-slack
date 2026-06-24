import type { Thread } from 'chat';
import { slack } from '@/lib/chat';
import logger from '@/lib/logger';
import { errorMessage } from '@/lib/utils/error';

const loadingMessages = [
  'is reading the room',
  'is checking the thread',
  'is sorting context',
  'is warming up the sandbox',
  'is lining things up',
  'is thinking suspiciously hard',
];

export async function startThinking({
  thread,
}: {
  thread: Thread;
}): Promise<void> {
  const { channel, threadTs } = slack.decodeThreadId(thread.id);
  if (!threadTs) {
    await thread.startTyping('is thinking');
    return;
  }

  await slack
    .setAssistantStatus(channel, threadTs, 'is thinking', loadingMessages)
    .catch((error: unknown) => {
      logger.warn(
        { err: errorMessage(error), threadId: thread.id },
        '[agent] failed to set thinking status'
      );
    });
}
