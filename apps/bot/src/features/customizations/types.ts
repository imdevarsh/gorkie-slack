import type {
  createSlackMrkdwn,
  createSlackPlainText,
} from '@chat-adapter/slack/format';

type SlackText = ReturnType<
  typeof createSlackMrkdwn | typeof createSlackPlainText
>;

interface SlackButtonElement {
  action_id?: string;
  confirm?: SlackConfirm;
  style?: 'danger' | 'primary';
  text: ReturnType<typeof createSlackPlainText>;
  type: 'button';
  value?: string;
}

export interface SlackTextInputElement {
  action_id: string;
  initial_value?: string;
  max_length?: number;
  multiline?: boolean;
  placeholder?: ReturnType<typeof createSlackPlainText>;
  type: 'plain_text_input';
}

interface SlackConfirm {
  confirm: ReturnType<typeof createSlackPlainText>;
  deny: ReturnType<typeof createSlackPlainText>;
  text: ReturnType<typeof createSlackMrkdwn>;
  title: ReturnType<typeof createSlackPlainText>;
}

export type SlackBlock =
  | {
      type: 'actions';
      elements: SlackButtonElement[];
    }
  | {
      accessory?: SlackButtonElement;
      text: ReturnType<typeof createSlackMrkdwn>;
      type: 'section';
    }
  | {
      elements: SlackText[];
      type: 'context';
    }
  | {
      type: 'divider';
    }
  | {
      text: ReturnType<typeof createSlackPlainText>;
      type: 'header';
    }
  | {
      block_id: string;
      element: SlackTextInputElement;
      hint?: ReturnType<typeof createSlackPlainText>;
      label: ReturnType<typeof createSlackPlainText>;
      type: 'input';
    };

export interface SlackHomeView {
  blocks: SlackBlock[];
  type: 'home';
}

export interface SlackModalView {
  blocks: SlackBlock[];
  callback_id: string;
  close: ReturnType<typeof createSlackPlainText>;
  private_metadata?: string;
  submit?: ReturnType<typeof createSlackPlainText>;
  title: ReturnType<typeof createSlackPlainText>;
  type: 'modal';
}
