import { auth } from '@ai-sdk/mcp';
import {
  getMcpOAuthConnection,
  getMcpServerByIdForUser,
  updateMcpServerForUser,
} from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { formatMcpError } from '@/lib/mcp/format-error';
import { guardedMcpFetch } from '@/lib/mcp/guarded-fetch';
import { createMcpOAuthProvider } from '@/lib/mcp/oauth-provider';
import { syncMcpPermissions } from '@/lib/mcp/remote';
import { codeBlock } from '@/slack/blocks';
import { publishHome } from '../../publish';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';
import { bearerModal, oauthModal, statusModal } from '../view';

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
  const opened = await client.views.open({
    trigger_id: body.trigger_id,
    view: statusModal({
      title: 'Connect MCP',
      text: 'Preparing connection...',
    }),
  });
  const viewId = opened.view?.id;
  if (!viewId) {
    return;
  }

  const server = await getMcpServerByIdForUser({
    id: action.value,
    userId: body.user.id,
  });
  if (!server) {
    await client.views.update({
      view_id: viewId,
      view: statusModal({
        title: 'Connect MCP',
        text: 'Could not find this MCP server.',
      }),
    });
    return;
  }
  if (server.authType === 'bearer') {
    await client.views.update({
      view_id: viewId,
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
    await client.views.update({
      view_id: viewId,
      view: statusModal({
        title: 'MCP OAuth Failed',
        text: 'Could not start OAuth. Return to Slack App Home and try again.',
      }),
    });
    await publishHome({ client, userId: body.user.id });
    return;
  }

  if (!authorizationUrlRef.value) {
    try {
      await syncMcpPermissions({
        server,
        teamId: body.team?.id,
        userId: body.user.id,
      });
      await updateMcpServerForUser({
        id: server.id,
        userId: body.user.id,
        values: {
          enabled: true,
          lastConnectedAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      const message = errorMessage(error);
      await updateMcpServerForUser({
        id: server.id,
        userId: body.user.id,
        values: {
          enabled: false,
          lastError: message,
        },
      });
      await publishHome({ client, userId: body.user.id });
      await client.views.update({
        view_id: viewId,
        view: statusModal({
          title: 'MCP Connection Failed',
          text: `OAuth is saved, but Gorkie could not discover tools.\n\n${codeBlock({ value: message, maxLength: 900 })}`,
        }),
      });
      return;
    }
    await publishHome({ client, userId: body.user.id });
    await client.views.update({
      view_id: viewId,
      view: statusModal({
        title: 'MCP Connected',
        text: 'This MCP server is connected. You can close this modal.',
      }),
    });
    return;
  }

  await client.views.update({
    view_id: viewId,
    view: oauthModal({
      authorizationUrl: authorizationUrlRef.value.toString(),
      serverId: server.id,
      serverName: server.name,
    }),
  });
}
