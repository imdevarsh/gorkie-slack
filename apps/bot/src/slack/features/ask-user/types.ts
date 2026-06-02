import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';

export type ActionArgs = SlackActionMiddlewareArgs<BlockAction> &
  AllMiddlewareArgs;

export interface AskUserButton {
  action_id: string;
  style?: 'danger' | 'primary';
  text: {
    emoji: false;
    text: string;
    type: 'plain_text';
  };
  type: 'button';
  value: string;
}

export interface AskUserOptionElement {
  description?: {
    emoji: false;
    text: string;
    type: 'plain_text';
  };
  text: {
    emoji: false;
    text: string;
    type: 'plain_text';
  };
  value: string;
}
