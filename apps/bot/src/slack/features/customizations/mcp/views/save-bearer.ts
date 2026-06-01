import { updateMcpServerForUser } from '@repo/db/queries';
import { encryptSecret } from '@repo/utils';
import type {
  AllMiddlewareArgs,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
} from '@slack/bolt';
import { env } from '@/env';
import { publishHome } from '../../publish';

export const name = 'home_mcp_bearer_save';

export async function execute({
  ack,
  body,
  client,
  view,
}: SlackViewMiddlewareArgs<ViewSubmitAction> &
  AllMiddlewareArgs): Promise<void> {
  const bearerToken =
    view.state.values.bearer_block?.bearer_input?.value?.trim() ?? '';
  if (!bearerToken) {
    await ack({
      errors: { bearer_block: 'Enter a bearer token.' },
      response_action: 'errors',
    });
    return;
  }

  let serverId = '';
  try {
    serverId = JSON.parse(view.private_metadata || '{}').serverId;
  } catch {
    serverId = '';
  }

  if (!serverId) {
    await ack({
      errors: { bearer_block: 'Could not identify this MCP server.' },
      response_action: 'errors',
    });
    return;
  }

  await ack();
  await updateMcpServerForUser({
    id: serverId,
    userId: body.user.id,
    values: {
      bearerToken: encryptSecret({
        plaintext: bearerToken,
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
      }),
      enabled: true,
      lastConnectedAt: null,
      lastError: null,
    },
  });
  await publishHome(client, body.user.id);
}
