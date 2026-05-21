import { toLogError } from "@repo/utils/error";
import type { App } from "@slack/bolt";
import { assistantThread } from "@/config";
import logger from "@/lib/logger";

export function register(app: App): void {
  app.event("assistant_thread_started", async ({ event, client }) => {
    const { channel_id, thread_ts, context } = event.assistant_thread;

    try {
      const prompts = context.channel_id
        ? assistantThread.suggestedPrompts.channel
        : assistantThread.suggestedPrompts.dm;

      await client.assistant.threads.setSuggestedPrompts({
        channel_id,
        thread_ts,
        prompts,
      });
    } catch (error) {
      logger.warn(
        { ...toLogError(error), channel: channel_id },
        "Failed to set suggested prompts"
      );
    }
  });
}
