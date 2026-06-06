import type { MCPModalState } from '@repo/validators';
import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
  SlackViewMiddlewareArgs,
  StaticSelectAction,
  ViewClosedAction,
  ViewSubmitAction,
} from '@slack/bolt';

export type Auth = NonNullable<MCPModalState['auth']>;
export type Transport = NonNullable<MCPModalState['transport']>;
export type ModalState = MCPModalState;

export type ButtonArgs = SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs;

export type SelectArgs = SlackActionMiddlewareArgs<
  BlockAction<StaticSelectAction>
> &
  AllMiddlewareArgs;

export type SubmitArgs = SlackViewMiddlewareArgs<ViewSubmitAction> &
  AllMiddlewareArgs;

export type CloseArgs = SlackViewMiddlewareArgs<ViewClosedAction> &
  AllMiddlewareArgs;
