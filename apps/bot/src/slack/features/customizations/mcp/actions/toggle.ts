import {
  getMCPServerById,
  hasMCPConnection,
  updateMCPServer,
} from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { syncMCPToolModes } from '@/lib/mcp/remote';
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
    const server = await getMCPServerById({
      id: serverId,
      userId: body.user.id,
    });
    if (!server) {
      return;
    }

    const hasCredentials = await hasMCPConnection({
      authType: server.authType,
      serverId,
      userId: body.user.id,
    });
    if (!hasCredentials) {
      await updateMCPServer({
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
      await publishHome({
        client,
        userId: body.user.id,
      });
      return;
    }

    try {
      await syncMCPToolModes({
        server,
        teamId: body.team?.id,
        userId: body.user.id,
      });
    } catch (error) {
      await updateMCPServer({
        id: serverId,
        userId: body.user.id,
        values: {
          enabled: false,
          lastError: errorMessage(error),
        },
      });
      await publishHome({
        client,
        userId: body.user.id,
      });
      return;
    }
  }

  await updateMCPServer({
    id: serverId,
    userId: body.user.id,
    values: { enabled, lastError: null },
  });
  await publishHome({ client, userId: body.user.id });
}
