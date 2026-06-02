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

export type Auth = 'bearer' | 'oauth';
export type Transport = 'http' | 'sse';

export interface ModalState {
  auth?: Auth;
  bearerToken?: string;
  clientId?: string;
  name?: string;
  transport?: Transport;
  url?: string;
}

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
