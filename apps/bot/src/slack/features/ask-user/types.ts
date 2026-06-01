import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';

export type ButtonArgs = SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs;
