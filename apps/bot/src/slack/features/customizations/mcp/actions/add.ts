import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { buildMcpAddModal } from '../view';

export const name = 'home_mcp_add';

export async function execute({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  await client.views.open({
    trigger_id: body.trigger_id,
    view: buildMcpAddModal(),
  });
}
