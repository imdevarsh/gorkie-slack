import { toLogError } from "@repo/utils/error";
import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import logger from "@/lib/logger";
import { applyPrompt } from "../../publish";

export const name = "home_clear_prompt";

export async function execute({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  try {
    await applyPrompt(client, userId, "");
  } catch (error) {
    logger.warn({ ...toLogError(error), userId }, "Failed to clear prompt");
  }
}
