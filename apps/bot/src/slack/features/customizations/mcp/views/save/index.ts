import {
  createMcpServer,
  updateMcpServerForUser,
  upsertMcpBearerConnection,
  upsertMcpOAuthConnection,
} from '@repo/db/queries';
import { encryptSecret } from '@repo/utils';
import { errorMessage } from '@repo/utils/error';
import { env } from '@/env';
import { syncMcpPermissions } from '@/lib/mcp/remote';
import { publishHome } from '../../../publish';
import { views } from '../../ids';
import type { SubmitArgs } from '../../types';
import { statusModal } from '../../view';
import { parseSavePayload } from './schema';

export const name = views.add;

export async function execute({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  const payload = await parseSavePayload({ view });
  if (!payload.data) {
    await ack({ errors: payload.errors, response_action: 'errors' });
    return;
  }

  const token =
    payload.data.auth === 'bearer'
      ? encryptSecret({
          plaintext: payload.data.bearerToken,
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        })
      : null;

  if (payload.data.auth === 'bearer') {
    await ack({
      response_action: 'update',
      view: statusModal({
        title: `Connect ${payload.data.name}`,
        text: 'Saving token and connecting…',
      }),
    });
  } else {
    await ack();
  }

  const server = await createMcpServer({
    authType: payload.data.auth,
    enabled: false,
    name: payload.data.name,
    teamId: body.team?.id ?? null,
    transport: payload.data.transport,
    url: payload.data.url,
    userId: body.user.id,
  });
  if (!server) {
    await publishHome({ client, userId: body.user.id });
    return;
  }
  if (token) {
    await upsertMcpBearerConnection({
      token,
      serverId: server.id,
      teamId: body.team?.id ?? null,
      userId: body.user.id,
    });
  }
  if (payload.data.auth === 'oauth' && payload.data.clientId) {
    await upsertMcpOAuthConnection({
      clientId: payload.data.clientId,
      serverId: server.id,
      teamId: body.team?.id ?? null,
      userId: body.user.id,
    });
  }
  if (payload.data.auth === 'bearer') {
    try {
      await syncMcpPermissions({
        server,
        teamId: body.team?.id,
        userId: body.user.id,
      });
      await updateMcpServerForUser({
        id: server.id,
        userId: body.user.id,
        values: { enabled: true, lastConnectedAt: new Date(), lastError: null },
      });
      await client.views.update({
        view_id: view.id,
        view: statusModal({
          title: `Connect ${payload.data.name}`,
          text: 'Connected successfully.',
        }),
      });
    } catch (error) {
      const message = errorMessage(error);
      await updateMcpServerForUser({
        id: server.id,
        userId: body.user.id,
        values: { enabled: false, lastError: message },
      });
      await client.views.update({
        view_id: view.id,
        view: statusModal({
          title: 'Connection Failed',
          text: `Token saved, but Gorkie could not connect:\n\`\`\`${message}\`\`\``,
        }),
      });
    }
  }
  await publishHome({ client, userId: body.user.id });
}
