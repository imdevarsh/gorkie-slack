import { App, ExpressReceiver, LogLevel } from '@slack/bolt';
import { env } from '~/env';
import { buildCache } from '~/lib/allowed-users';
import logger from '~/lib/logger';
import { events } from './events';

export interface SlackApp {
  app: App;
  receiver?: ExpressReceiver;
  socketMode: boolean;
}

function registerApp(app: App) {
  buildCache(app);
  for (const event of events) {
    app.event(event.name, event.execute);
  }
}

export function createSlackApp(): SlackApp {
  if (env.SLACK_SOCKET_MODE) {
    if (!env.SLACK_APP_TOKEN) {
      throw new Error(
        'SLACK_APP_TOKEN is required when socket mode is enabled.'
      );
    }

    const app = new App({
      token: env.SLACK_BOT_TOKEN,
      signingSecret: env.SLACK_SIGNING_SECRET,
      appToken: env.SLACK_APP_TOKEN,
      socketMode: true,
      logLevel: LogLevel.INFO,
    });

    registerApp(app);

    logger.info('Initialized Slack app in socket mode');

    return { app, socketMode: true };
  }

  const receiver = new ExpressReceiver({
    signingSecret: env.SLACK_SIGNING_SECRET,
  });

  const app = new App({
    token: env.SLACK_BOT_TOKEN,
    receiver,
    logLevel: LogLevel.INFO,
  });

  registerApp(app);

  logger.info('Initialized Slack app with HTTP receiver');

  return { app, receiver, socketMode: false };
}
