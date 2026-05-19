import type {
  AllMiddlewareArgs,
  App,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { cancelScheduledTaskForUser } from '~/db/queries/scheduled-tasks';
import logger from '~/lib/logger';
import { publishHome } from '~/slack/features/customizations/publish';
import { toLogError } from '~/utils/error';

type ActionArgs = SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs;

export function register(app: App): void {
  app.event('app_home_opened', async ({ event, client }) => {
    try {
      await publishHome(client, event.user);
    } catch (error) {
      logger.warn(
        { ...toLogError(error), userId: event.user },
        'Failed to publish App Home'
      );
    }
  });

  app.action(
    'home_cancel_task',
    async ({ ack, action, body, client }: ActionArgs) => {
      await ack();
      const userId = body.user.id;
      const taskId = typeof action.value === 'string' ? action.value : '';
      try {
        await cancelScheduledTaskForUser(taskId, userId);
        await publishHome(client, userId);
      } catch (error) {
        logger.warn(
          { ...toLogError(error), userId, taskId },
          'Failed to cancel task from App Home'
        );
      }
    }
  );
}
