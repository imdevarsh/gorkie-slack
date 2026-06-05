import type { App } from '@slack/bolt';
import { register as registerAppHomeOpened } from './app-home-opened';
import { register as registerAssistantThreadContextChanged } from './assistant-thread-context-changed';
import { register as registerAssistantThreadStarted } from './assistant-thread-started';
import {
  execute as messageCreateExecute,
  name as messageCreateName,
} from './message-create';

export const eventRegisters: Array<(app: App) => void> = [
  (app) => app.event(messageCreateName, messageCreateExecute),
  registerAssistantThreadStarted,
  registerAssistantThreadContextChanged,
  registerAppHomeOpened,
];
