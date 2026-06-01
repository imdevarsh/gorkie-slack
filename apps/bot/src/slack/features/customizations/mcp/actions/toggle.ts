import {
  getMcpOAuthConnection,
  getMcpServerByIdForUser,
  updateMcpServerForUser,
} from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { syncMcpToolPermissions } from '@/lib/mcp/remote';
import { publishHome } from '../../publish';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';

export const enableName = actions.enable;
export const disableName = actions.disable;

export async function execute({
  ack,
  action,
  body,
  client,
}: ButtonArgs): Promise<void> {
  await ack();
  const serverId = action.value;
  if (!serverId) {
    return;
  }
  const enabled = action.action_id === enableName;
  if (enabled) {
    const server = await getMcpServerByIdForUser({
      id: serverId,
      userId: body.user.id,
    });
    if (!server) {
      return;
    }

    const connection =
      server.authType === 'bearer'
        ? server.bearerToken
        : await getMcpOAuthConnection({
            serverId,
            userId: body.user.id,
          });
    if (!connection) {
      await updateMcpServerForUser({
        id: serverId,
        userId: body.user.id,
        values: {
          enabled: false,
          lastError:
            server.authType === 'bearer'
              ? 'Bearer token required before tools can be enabled.'
              : 'OAuth connection required before tools can be enabled.',
        },
      });
      await publishHome(client, body.user.id);
      return;
    }

    try {
      await syncMcpToolPermissions({
        server,
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
      await publishHome(client, body.user.id);
      return;
    }
  }

  await updateMcpServerForUser({
    id: serverId,
    userId: body.user.id,
    values: { enabled, lastError: null },
  });
  await publishHome(client, body.user.id);
}
