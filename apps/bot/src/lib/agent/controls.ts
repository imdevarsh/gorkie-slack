import { toLogError } from '@repo/utils/error';
import { Actions, Button, Card, type SentMessage, type Thread } from 'chat';
import logger from '@/lib/logger';

export async function postTurnControls({
  thread,
}: {
  thread: Thread;
}): Promise<SentMessage | null> {
  try {
    return await thread.post(
      Card({
        children: [
          Actions([
            Button({
              id: 'stop_turn',
              label: 'Stop',
              style: 'danger',
              value: thread.id,
            }),
          ]),
        ],
      })
    );
  } catch (error) {
    logger.warn(
      { err: error, threadId: thread.id },
      'Failed to post stop button'
    );
    return null;
  }
}

export async function deleteTurnControls({
  controls,
}: {
  controls: SentMessage | null;
}): Promise<void> {
  if (!controls) {
    return;
  }

  await controls.delete().catch((error: unknown) => {
    logger.warn({ ...toLogError(error) }, 'Failed to delete stop button');
  });
}
