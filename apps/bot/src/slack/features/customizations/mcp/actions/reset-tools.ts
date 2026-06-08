import {
  deleteAllMCPToolPermissions,
  getMCPServerById,
  updateMCPServer,
} from '@repo/db/queries';
import { publishHome } from '../../publish';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';
import { statusModal, toolsModal } from '../view';
import { syncToolsForView } from './helpers';

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

  const statusResult = await client.views
    .update({
      hash: body.view?.hash,
      view_id: viewId,
      view: statusModal({
        title: 'MCP Tools',
        text: 'Resetting tools...',
      }),
    })
    .catch(() => undefined);
  const statusHash = statusResult?.view?.hash;

  const server = await getMCPServerById({
    id: serverId,
    userId: body.user.id,
  });
  if (!server) {
    await client.views
      .update({
        hash: statusHash,
        view_id: viewId,
        view: statusModal({
          title: 'MCP Tools',
          text: 'Could not find this MCP server.',
        }),
      })
      .catch(() => undefined);
    return;
  }

  await deleteAllMCPToolPermissions({ serverId, userId: body.user.id });

  const { error, toolEntries, toolModes } = await syncToolsForView({
    server,
    teamId: body.team?.id,
    userId: body.user.id,
  });
  if (error) {
    await updateMCPServer({
      id: server.id,
      userId: body.user.id,
      values: { enabled: false, lastError: error },
    });
    await publishHome({ client, userId: body.user.id });
  }

  await client.views
    .update({
      hash: statusHash,
      view_id: viewId,
      view: toolsModal({
        error,
        serverId,
        serverName: server.name,
        toolModes,
        tools: toolEntries,
      }),
    })
    .catch(() => undefined);
}
