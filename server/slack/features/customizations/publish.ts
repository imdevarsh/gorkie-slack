import type { WebClient } from '@slack/web-api';
import { getUserCustomization } from '~/db/queries/customizations';
import { listScheduledTasksByUser } from '~/db/queries/scheduled-tasks';
import { buildHomeView } from '~/slack/events/app-home-opened/view';

export async function publishHome(
  client: WebClient,
  userId: string
): Promise<void> {
  const [tasks, customization] = await Promise.all([
    listScheduledTasksByUser(userId),
    getUserCustomization(userId),
  ]);

  await client.views.publish({
    user_id: userId,
    view: buildHomeView(tasks, customization),
  });
}
