import {
  clearUserCustomization,
  getUserCustomization,
  listMCPServers,
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
    listMCPServers({ userId }),
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
  await savePrompt({ prompt, userId });
  await publishHome({ client, userId });
}

export async function savePrompt({
  prompt,
  userId,
}: {
  prompt: string;
  userId: string;
}): Promise<void> {
  if (prompt) {
    await setUserCustomization(userId, { prompt });
  } else {
    await clearUserCustomization(userId);
  }
}
