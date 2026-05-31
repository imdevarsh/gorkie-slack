import { deleteMcpServerForUser } from '@repo/db/queries';
import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { publishHome } from '../../publish';

export const name = 'home_mcp_delete';

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
  await deleteMcpServerForUser({ id: action.value, userId: body.user.id });
  await publishHome(client, body.user.id);
}
