import { cancelScheduledTaskForUser } from '@repo/db/queries';
import { toLogError } from '@repo/utils/error';
import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import logger from '@/lib/logger';
import { publishHome } from '../publish';

async function cancelTask({
  ack,
  action,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  const taskId = typeof action.value === 'string' ? action.value.trim() : '';
  if (!taskId) {
    logger.warn({ userId }, 'Missing scheduled task ID for cancel action');
    return;
  }

  try {
    const cancelled = await cancelScheduledTaskForUser(taskId, userId);
    if (!cancelled) {
      logger.warn(
        { userId, taskId },
        'Scheduled task cancel action did not match an active task'
      );
    }
    await publishHome({ client, userId });
  } catch (error) {
    logger.warn(
      { ...toLogError(error), userId, taskId },
      'Failed to cancel task'
    );
  }
}

export const scheduledTasks = {
  buttonActions: [{ name: 'home_cancel_task', execute: cancelTask }],
};
