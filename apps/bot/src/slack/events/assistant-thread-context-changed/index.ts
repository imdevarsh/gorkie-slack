import type { App } from "@slack/bolt";
import logger from "@/lib/logger";

export function register(app: App): void {
  app.event("assistant_thread_context_changed", ({ event }) => {
    const { channel_id, context } = event.assistant_thread;
    logger.debug(
      { channel: channel_id, contextChannel: context.channel_id },
      "Assistant thread context changed"
    );
    return Promise.resolve();
  });
}
