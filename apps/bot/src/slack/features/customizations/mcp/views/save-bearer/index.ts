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
import { blocks, inputs, views } from '../../ids';
import {
  parsePrivateMetadata,
  serverMetaSchema,
  viewValueSchema,
} from '../../schema';
import type { SubmitArgs } from '../../types';

export const name = views.bearer;

export async function execute({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  const bearerToken =
    viewValueSchema
      .parse(view.state.values[blocks.bearer]?.[inputs.bearer])
      .value?.trim() ?? '';
  if (!bearerToken) {
    await ack({
      errors: { [blocks.bearer]: 'Enter a bearer token.' },
      response_action: 'errors',
    });
    return;
  }

  const meta = serverMetaSchema.safeParse(
    parsePrivateMetadata({ metadata: view.private_metadata })
  );
  const serverId = meta.success ? meta.data.serverId : null;
  if (!serverId) {
    await ack({
      errors: { [blocks.bearer]: 'Could not identify this MCP server.' },
      response_action: 'errors',
    });
    return;
  }

  const server = await getMcpServerByIdForUser({
    id: serverId,
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
    plaintext: bearerToken,
    secret: env.MCP_TOKEN_ENCRYPTION_KEY,
  });
  await ack();
  await upsertMcpBearerConnection({
    token,
    serverId,
    teamId: body.team?.id ?? null,
    userId: body.user.id,
  });
  await updateMcpServerForUser({
    id: serverId,
    userId: body.user.id,
    values: {
      enabled: true,
      lastConnectedAt: null,
      lastError: null,
    },
  });
  const updatedServer = await getMcpServerByIdForUser({
    id: serverId,
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
        id: serverId,
        userId: body.user.id,
        values: {
          enabled: false,
          lastError: errorMessage(error),
        },
      });
    }
  }
  await publishHome({ client, userId: body.user.id });
}
