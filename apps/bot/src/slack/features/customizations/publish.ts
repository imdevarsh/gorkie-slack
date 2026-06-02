import {
  clearUserCustomization,
  getUserCustomization,
  listMcpServersByUser,
  listScheduledTasksByUser,
  setUserCustomization,
} from '@repo/db/queries';
import type { WebClient } from '@slack/web-api';
import { buildHomeView } from './view';

export async function publishHome({
  client,
  userId,
}: {
  client: WebClient;
  userId: string;
}): Promise<void> {
  const [tasks, customization, mcpServers] = await Promise.all([
    listScheduledTasksByUser(userId),
    getUserCustomization(userId),
    listMcpServersByUser({ userId }),
  ]);
  await client.views.publish({
    user_id: userId,
    view: buildHomeView({ tasks, customization, mcpServers }),
  });
}

export async function applyPrompt({
  client,
  userId,
  prompt,
}: {
  client: WebClient;
  userId: string;
  prompt: string;
}): Promise<void> {
  if (prompt) {
    await setUserCustomization(userId, { prompt });
  } else {
    await clearUserCustomization(userId);
  }
  await publishHome({ client, userId });
}
