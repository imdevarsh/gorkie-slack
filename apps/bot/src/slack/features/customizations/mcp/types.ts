import type { MCPModalState } from '@repo/validators';
import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  PlainTextInputAction,
  SlackActionMiddlewareArgs,
  SlackViewMiddlewareArgs,
  StaticSelectAction,
  ViewClosedAction,
  ViewSubmitAction,
} from '@slack/bolt';

export type Transport = NonNullable<MCPModalState['transport']>;

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

export type InputArgs = SlackActionMiddlewareArgs<
  BlockAction<PlainTextInputAction>
> &
  AllMiddlewareArgs;
