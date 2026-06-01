import type {
  AllMiddlewareArgs,
  SlackViewMiddlewareArgs,
  ViewClosedAction,
} from '@slack/bolt';
import { publishHome } from '../../publish';

export const name = 'home_mcp_connect_status';
export const viewType = 'view_closed' as const;

export async function execute({
  ack,
  body,
  client,
}: SlackViewMiddlewareArgs<ViewClosedAction> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  await publishHome(client, body.user.id);
}
