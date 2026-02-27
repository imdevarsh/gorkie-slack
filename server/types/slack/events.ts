import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';

export type MessageEventArgs = SlackEventMiddlewareArgs<'message'> &
  AllMiddlewareArgs;
