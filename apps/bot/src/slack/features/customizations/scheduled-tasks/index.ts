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
  const taskId = typeof action.value === 'string' ? action.value : '';
  try {
    await cancelScheduledTaskForUser(taskId, userId);
    await publishHome({ client, userId, teamId: body.team?.id });
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
