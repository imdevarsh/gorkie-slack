import {
  getMcpServerByIdForUser,
  updateMcpServerForUser,
  upsertMcpBearerConnection,
} from '@repo/db/queries';
import { encryptSecret } from '@repo/utils';
import { errorMessage } from '@repo/utils/error';
import { env } from '@/env';
import { syncMcpPermissions } from '@/lib/mcp/remote';
import { publishHome } from '../../../publish';
import { blocks, views } from '../../ids';
import type { SubmitArgs } from '../../types';
import { parseSaveBearerPayload } from './schema';

export const name = views.bearer;

export async function execute({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  const payload = parseSaveBearerPayload({ view });
  if (!payload.data) {
    await ack({ errors: payload.errors, response_action: 'errors' });
    return;
  }

  const server = await getMcpServerByIdForUser({
    id: payload.data.serverId,
    userId: body.user.id,
  });
  if (!server) {
    await ack({
      errors: { [blocks.bearer]: 'Could not find this MCP server.' },
      response_action: 'errors',
    });
    return;
  }

  const token = encryptSecret({
    plaintext: payload.data.bearerToken,
    secret: env.MCP_TOKEN_ENCRYPTION_KEY,
  });
  await ack();
  await upsertMcpBearerConnection({
    token,
    serverId: payload.data.serverId,
    teamId: body.team?.id ?? null,
    userId: body.user.id,
  });
  await updateMcpServerForUser({
    id: payload.data.serverId,
    userId: body.user.id,
    values: {
      enabled: true,
      lastConnectedAt: null,
      lastError: null,
    },
  });
  const updatedServer = await getMcpServerByIdForUser({
    id: payload.data.serverId,
    userId: body.user.id,
  });
  if (updatedServer) {
    try {
      await syncMcpPermissions({
        server: updatedServer,
        teamId: body.team?.id,
        userId: body.user.id,
      });
    } catch (error) {
      await updateMcpServerForUser({
        id: payload.data.serverId,
        userId: body.user.id,
        values: {
          enabled: false,
          lastError: errorMessage(error),
        },
      });
    }
  }
  await publishHome(client, body.user.id);
}
