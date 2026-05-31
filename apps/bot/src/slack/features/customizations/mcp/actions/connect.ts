import { auth } from '@ai-sdk/mcp';
import {
  getMcpOAuthConnection,
  getMcpServerByIdForUser,
  updateMcpServerForUser,
} from '@repo/db/queries';
import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { guardedMcpFetch } from '@/lib/mcp/guarded-fetch';
import { createMcpOAuthProvider } from '@/lib/mcp/oauth-provider';
import { publishHome } from '../../publish';
import { buildMcpConnectModal } from '../view';

export const name = 'home_mcp_connect';

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

  const server = await getMcpServerByIdForUser({
    id: action.value,
    userId: body.user.id,
  });
  if (!server) {
    return;
  }

  const connection = await getMcpOAuthConnection({
    serverId: server.id,
    userId: body.user.id,
  });
  const authorizationUrlRef: { value?: URL } = {};

  try {
    await auth(
      createMcpOAuthProvider({ authorizationUrlRef, connection, server }),
      {
        fetchFn: guardedMcpFetch as typeof fetch,
        serverUrl: server.url,
      }
    );
    await updateMcpServerForUser({
      id: server.id,
      userId: body.user.id,
      values: { lastError: null },
    });
  } catch (error) {
    await updateMcpServerForUser({
      id: server.id,
      userId: body.user.id,
      values: {
        enabled: false,
        lastError: error instanceof Error ? error.message : 'OAuth failed',
      },
    });
    await publishHome(client, body.user.id);
    return;
  }

  if (!authorizationUrlRef.value) {
    await publishHome(client, body.user.id);
    return;
  }

  await client.views.open({
    trigger_id: body.trigger_id,
    view: buildMcpConnectModal({
      authorizationUrl: authorizationUrlRef.value.toString(),
    }),
  });
}
