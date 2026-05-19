import type { App } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { getUserCustomization } from '~/db/queries/customizations';
import { listScheduledTasksByUser } from '~/db/queries/scheduled-tasks';
import logger from '~/lib/logger';
import { toLogError } from '~/utils/error';
import { registerActions } from './actions';
import { registerViews } from './on-view';
import { buildHomeView } from './view';

async function publishHome(client: WebClient, userId: string): Promise<void> {
  const [tasks, customization] = await Promise.all([
    listScheduledTasksByUser(userId),
    getUserCustomization(userId),
  ]);
  await client.views.publish({
    user_id: userId,
    view: buildHomeView(tasks, customization),
  });
}

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

  registerActions(app, publishHome);
  registerViews(app, publishHome);
}
