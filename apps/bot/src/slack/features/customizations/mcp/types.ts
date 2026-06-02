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
import { z } from 'zod';

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

export const serverMetaSchema = z.object({
  serverId: z.string().optional(),
});

export type ServerMeta = z.infer<typeof serverMetaSchema>;

export function parseServerMeta({
  metadata,
}: {
  metadata: string;
}): ServerMeta {
  try {
    const result = serverMetaSchema.safeParse(JSON.parse(metadata || '{}'));
    return result.success ? result.data : {};
  } catch {
    return {};
  }
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
