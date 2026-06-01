import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';

export type ButtonArgs = SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs;

export interface AskUserButton {
  action_id: string;
  style?: 'primary';
  text: {
    emoji: false;
    text: string;
    type: 'plain_text';
  };
  type: 'button';
  value: string;
}
