import { cancelScheduledTaskForUser } from "@repo/db/queries";
import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import logger from "@/lib/logger";
import { toLogError } from "@/utils/error";
import { publishHome } from "../../publish";

export const name = "home_cancel_task";

export async function execute({
  ack,
  action,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  const taskId = typeof action.value === "string" ? action.value : "";
  try {
    await cancelScheduledTaskForUser(taskId, userId);
    await publishHome(client, userId);
  } catch (error) {
    logger.warn(
      { ...toLogError(error), userId, taskId },
      "Failed to cancel task"
    );
  }
}
