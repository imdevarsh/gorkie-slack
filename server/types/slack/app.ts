import type { App, ExpressReceiver } from '@slack/bolt';

export interface SlackApp {
  app: App;
  receiver?: ExpressReceiver;
  socketMode: boolean;
}
