import {
  deleteMcpOAuthConnection,
  updateMcpServerForUser,
} from '@repo/db/queries';
import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { publishHome } from '../../publish';

export const name = 'home_mcp_disconnect';

export async function execute({
  ack,
  action,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  if (!action.value) {
    return;
  }
  await deleteMcpOAuthConnection({
    serverId: action.value,
    userId: body.user.id,
  });
  await updateMcpServerForUser({
    id: action.value,
    userId: body.user.id,
    values: { enabled: false, lastConnectedAt: null },
  });
  await publishHome(client, body.user.id);
}
