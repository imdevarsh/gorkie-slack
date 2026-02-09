import {
  execute as messageCreateExecute,
  name as messageCreateName,
} from './message-create';

export const events = [
  {
    name: messageCreateName,
    execute: messageCreateExecute,
  },
] as const;
