import { App } from "@slack/bolt";
import { env } from "../env";

const app = new App({
  token: env.SLACK_BOT_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  appToken: env.SLACK_APP_TOKEN,
  socketMode: true,
});

await app.start();
console.log("Bot is running");
