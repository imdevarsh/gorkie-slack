import { toLogError } from "@repo/utils/error";
import type { App } from "@slack/bolt";
import logger from "@/lib/logger";
import { publishHome } from "@/slack/features/customizations/publish";

export function register(app: App): void {
  app.event("app_home_opened", async ({ event, client }) => {
    try {
      await publishHome(client, event.user);
    } catch (error) {
      logger.warn(
        { ...toLogError(error), userId: event.user },
        "Failed to publish App Home"
      );
    }
  });
}
