import {
  getMcpServerByIdForUser,
  updateMcpServerForUser,
  upsertMcpBearerConnection,
} from '@repo/db/queries';
import { encryptSecret } from '@repo/utils';
import { errorMessage } from '@repo/utils/error';
import { env } from '@/env';
import { formatMcpError } from '@/lib/mcp/format-error';
import { syncMcpPermissions } from '@/lib/mcp/remote';
import { publishHome } from '../../../publish';
import { blocks, inputs, views } from '../../ids';
import { parseServerMeta, viewValueSchema } from '../../schema';
import type { SubmitArgs } from '../../types';
import { statusModal } from '../../view';

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

  const serverId =
    parseServerMeta({ metadata: view.private_metadata }).serverId ?? null;
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
  await ack({
    response_action: 'update',
    view: statusModal({
      title: `Connect ${server.name}`,
      text: 'Saving token and connecting…',
    }),
  });
  await upsertMcpBearerConnection({
    token,
    serverId,
    teamId: body.team?.id ?? null,
    userId: body.user.id,
  });
  await updateMcpServerForUser({
    id: serverId,
    userId: body.user.id,
    values: { enabled: false, lastConnectedAt: null, lastError: null },
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
      await updateMcpServerForUser({
        id: serverId,
        userId: body.user.id,
        values: { enabled: true, lastConnectedAt: new Date(), lastError: null },
      });
      await client.views.update({
        view_id: view.id,
        view: statusModal({
          title: `Connect ${server.name}`,
          text: 'Connected successfully.',
        }),
      });
    } catch (error) {
      const message = errorMessage(error);
      await updateMcpServerForUser({
        id: serverId,
        userId: body.user.id,
        values: { enabled: false, lastError: message },
      });
      await client.views.update({
        view_id: view.id,
        view: statusModal({
          title: 'Connection Failed',
          text: `Token saved, but Gorkie could not connect:\n\`\`\`${formatMcpError(message)}\`\`\``,
        }),
      });
    }
  }
  await publishHome({ client, userId: body.user.id });
}
