import { auth } from '@ai-sdk/mcp';
import {
  getMcpOAuthConnection,
  getMcpServerByIdForUser,
  updateMcpServerForUser,
} from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { guardedMcpFetch } from '@/lib/mcp/guarded-fetch';
import { createMcpOAuthProvider } from '@/lib/mcp/oauth-provider';
import { syncMcpPermissions } from '@/lib/mcp/remote';
import { publishHome } from '../../publish';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';
import { bearerModal, oauthModal } from '../view';

export const name = actions.connect;

export async function execute({
  ack,
  action,
  body,
  client,
}: ButtonArgs): Promise<void> {
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
  if (server.authType === 'bearer') {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: bearerModal({
        serverId: server.id,
        serverName: server.name,
      }),
    });
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
        fetchFn: guardedMcpFetch,
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
    try {
      await syncMcpPermissions({
        server,
        teamId: body.team?.id,
        userId: body.user.id,
      });
    } catch (error) {
      await updateMcpServerForUser({
        id: server.id,
        userId: body.user.id,
        values: {
          enabled: false,
          lastError: errorMessage(error),
        },
      });
    }
    await publishHome(client, body.user.id);
    return;
  }

  await client.views.open({
    trigger_id: body.trigger_id,
    view: oauthModal({
      authorizationUrl: authorizationUrlRef.value.toString(),
      serverId: server.id,
    }),
  });
}
