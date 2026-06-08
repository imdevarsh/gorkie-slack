import {
  deleteAllMCPToolPermissions,
  getMCPServerById,
  updateMCPServer,
} from '@repo/db/queries';
import type { MCPToolModeMap } from '@repo/db/schema';
import { errorMessage } from '@repo/utils/error';
import { syncMCPToolModes } from '@/lib/mcp/remote';
import { publishHome } from '../../publish';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';
import { statusModal, toolsModal } from '../view';
import { toToolEntries } from '../view/tools';

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

  let error: string | undefined;
  let toolEntries: ReturnType<typeof toToolEntries> = [];
  let toolModes: MCPToolModeMap = {};
  try {
    const synced = await syncMCPToolModes({
      server,
      teamId: body.team?.id,
      userId: body.user.id,
    });
    toolEntries = toToolEntries(synced.definitions.tools);
    toolModes = synced.modes;
  } catch (err) {
    error = errorMessage(err);
    await updateMCPServer({
      id: server.id,
      userId: body.user.id,
      values: {
        enabled: false,
        lastError: error,
      },
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
