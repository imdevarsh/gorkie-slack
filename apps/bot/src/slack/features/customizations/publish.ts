import {
  clearUserCustomization,
  getUserCustomization,
  listScheduledTasksByUser,
  setUserCustomization,
} from "@repo/db/queries";
import type { WebClient } from "@slack/web-api";
import { buildHomeView } from "./view";

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
    view: buildHomeView({ tasks, customization }),
  });
}

export async function applyPrompt(
  client: WebClient,
  userId: string,
  prompt: string
): Promise<void> {
  if (prompt) {
    await setUserCustomization(userId, { prompt });
  } else {
    await clearUserCustomization(userId);
  }
  await publishHome(client, userId);
}
