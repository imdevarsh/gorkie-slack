import { App, ExpressReceiver, LogLevel } from '@slack/bolt';
import { env } from '@/env';
import { buildCache } from '@/lib/allowed-users';
import logger from '@/lib/logger';
import type { SlackApp } from '@/types';
import { register as registerAppHomeOpened } from './events/app-home-opened';
import { register as registerAssistantThreadContextChanged } from './events/assistant-thread-context-changed';
import { register as registerAssistantThreadStarted } from './events/assistant-thread-started';
import {
  execute as messageCreateExecute,
  name as messageCreateName,
} from './events/message-create';
import { customizations } from './features/customizations';

function registerApp(app: App) {
  buildCache(app);

  app.event(messageCreateName, messageCreateExecute);

  registerAssistantThreadStarted(app);
  registerAssistantThreadContextChanged(app);
  registerAppHomeOpened(app);

  for (const action of customizations.buttonActions) {
    app.action(action.name, action.execute);
  }

  for (const action of customizations.selectActions) {
    app.action(action.name, action.execute);
  }

  for (const view of customizations.submitViews) {
    app.view(view.name, view.execute);
  }

  for (const view of customizations.closedViews) {
    app.view({ callback_id: view.name, type: 'view_closed' }, view.execute);
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
