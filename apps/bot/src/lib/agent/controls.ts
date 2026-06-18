import { deleteSlackMessage, postSlackMessage } from '@chat-adapter/slack/api';
import type { Thread } from 'chat';
import { env } from '@/env';
import logger from '@/lib/logger';
import { getThread } from '@/lib/slack/thread';

interface SlackControlMessage {
  channel: string;
  ts: string;
}

export async function postTurnControls({
  thread,
}: {
  thread: Thread;
}): Promise<SlackControlMessage | null> {
  const slackThread = getThread(thread);
  if (!slackThread) {
    return null;
  }

  const posted = await postSlackMessage({
    blocks: [
      {
        elements: [
          {
            action_id: 'gorkie_stop_turn',
            style: 'danger',
            text: { text: 'Stop', type: 'plain_text' },
            type: 'button',
            value: thread.id,
          },
        ],
        type: 'actions',
      },
    ],
    channel: slackThread.channel,
    text: 'Gorkie is responding...',
    threadTs: slackThread.threadTs,
    token: env.SLACK_BOT_TOKEN,
  }).catch((error: unknown) => {
    logger.warn(
      { err: error, threadId: thread.id },
      'Failed to post stop button'
    );
    return null;
  });

  return posted?.channel ? { channel: posted.channel, ts: posted.id } : null;
}

export async function deleteTurnControls({
  controls,
}: {
  controls: SlackControlMessage | null;
}): Promise<void> {
  if (!controls) {
    return;
  }

  await deleteSlackMessage({
    channel: controls.channel,
    token: env.SLACK_BOT_TOKEN,
    ts: controls.ts,
  }).catch(() => undefined);
}
