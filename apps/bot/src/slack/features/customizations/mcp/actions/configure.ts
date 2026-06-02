import type { ListToolsResult } from '@ai-sdk/mcp';
import {
  getMcpServerByIdForUser,
  listMcpToolPermissions,
  updateMcpServerForUser,
} from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { syncMcpPermissions } from '@/lib/mcp/remote';
import { publishHome } from '../../publish';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';
import { toolsModal } from '../view';

export const name = actions.configure;

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

  const server = await getMcpServerByIdForUser({
    id: serverId,
    userId: body.user.id,
  });
  if (!server) {
    return;
  }

  let discoveryError: string | undefined;
  let definitions: ListToolsResult | undefined;
  try {
    const synced = await syncMcpPermissions({
      server,
      teamId: body.team?.id,
      userId: body.user.id,
    });
    definitions = synced.definitions;
  } catch (error) {
    discoveryError = errorMessage(error);
    await updateMcpServerForUser({
      id: server.id,
      userId: body.user.id,
      values: {
        enabled: false,
        lastError: discoveryError,
      },
    });
    await publishHome(client, body.user.id);
  }
  const permissions = await listMcpToolPermissions({
    serverId,
    userId: body.user.id,
  });

  await client.views.open({
    trigger_id: body.trigger_id,
    view: toolsModal({
      error: discoveryError,
      permissions: permissions.filter(
        (permission) => permission.scope === 'global'
      ),
      serverId,
      serverName: server.name,
      tools: definitions?.tools ?? [],
    }),
  });
}
