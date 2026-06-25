import type { Message, Thread } from 'chat';
import { compactTurn, stopTurn } from '@/lib/agent';
import logger from '@/lib/logger';
import { toLogError } from '@/lib/utils/error';
import { rawText, withoutLeadingMentions } from '@/lib/utils/message';

type BotCommand =
  | {
      instructions?: string;
      type: 'compact';
    }
  | {
      type: 'stop';
    };

export async function handleCommand({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<boolean> {
  const command = cmd(message);
  if (!command) {
    return false;
  }
  if (command.type === 'compact') {
    await compactTurn({
      instructions: command.instructions,
      message,
      thread,
    });
    return true;
  }

  const stopped = stopTurn({ threadId: thread.id });
  if (!stopped) {
    await thread
      .postEphemeral(message.author, 'no active response to stop.', {
        fallbackToDM: false,
      })
      .catch((error: unknown) => {
        logger.warn(
          {
            ...toLogError(error),
            threadId: thread.id,
            userId: message.author.userId,
          },
          'Failed to post stop feedback'
        );
      });
  }
  return true;
}

function cmd(message: Message): BotCommand | null {
  const body = withoutLeadingMentions(rawText(message)).trim();

  const match = body.match(/^!(\w+)\b(.*)$/is);
  if (!match?.[1]) {
    return null;
  }

  switch (match[1].toLowerCase()) {
    case 'compact':
      return {
        instructions: (match?.[2] ?? '').trim() || undefined,
        type: 'compact',
      };
    case 'stop':
      return { type: 'stop' };
    default:
      return null;
  }
}
