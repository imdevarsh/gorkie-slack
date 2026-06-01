import {
  getMcpBearerConnection,
  getMcpOAuthConnection,
  getMcpServerByIdForUser,
  updateMcpServerForUser,
} from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { syncMcpPermissions } from '@/lib/mcp/remote';
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

    const hasCredentials = await (server.authType === 'bearer'
      ? getMcpBearerConnection({
          serverId,
          userId: body.user.id,
        }).then((connection) => Boolean(connection?.token))
      : getMcpOAuthConnection({
          serverId,
          userId: body.user.id,
        }).then((connection) => Boolean(connection?.tokens)));
    if (!hasCredentials) {
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
      await syncMcpPermissions({
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
