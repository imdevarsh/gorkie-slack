import { updateMcpServerForUser } from '@repo/db/queries';
import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { publishHome } from '../../publish';

export const enableName = 'home_mcp_enable';
export const disableName = 'home_mcp_disable';

export async function execute({
  ack,
  action,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const serverId = action.value;
  if (!serverId) {
    return;
  }
  await updateMcpServerForUser({
    id: serverId,
    userId: body.user.id,
    values: { enabled: action.action_id === enableName },
  });
  await publishHome(client, body.user.id);
}
