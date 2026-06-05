import type { ListToolsResult } from '@ai-sdk/mcp';
import {
  getMcpServerByIdForUser,
  listMcpToolPermissions,
  resetMcpToolPermissions,
  updateMcpServerForUser,
} from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { syncMcpPermissions } from '@/lib/mcp/remote';
import { publishHome } from '../../publish';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';
import { statusModal, toolsModal } from '../view';

export const name = actions.resetTools;

export async function execute({
  ack,
  action,
  body,
  client,
}: ButtonArgs): Promise<void> {
  await ack();
  const serverId = action.value;
  const viewId = body.view?.id;
  if (!(serverId && viewId)) {
    return;
  }

  await client.views.update({
    view_id: viewId,
    view: statusModal({
      title: 'MCP Tools',
      text: 'Resetting tools...',
    }),
  });

  const server = await getMcpServerByIdForUser({
    id: serverId,
    userId: body.user.id,
  });
  if (!server) {
    await client.views.update({
      view_id: viewId,
      view: statusModal({
        title: 'MCP Tools',
        text: 'Could not find this MCP server.',
      }),
    });
    return;
  }

  await resetMcpToolPermissions({ serverId, userId: body.user.id });

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
    await publishHome({ client, userId: body.user.id });
  }

  const permissions = await listMcpToolPermissions({
    serverId,
    userId: body.user.id,
  });

  await client.views.update({
    view_id: viewId,
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
