import type { ListToolsResult } from '@ai-sdk/mcp';
import {
  getMcpServerById,
  resetMcpToolModes,
  updateMcpServer,
} from '@repo/db/queries';
import type { McpToolModeMap } from '@repo/db/schema';
import { errorMessage } from '@repo/utils/error';
import { syncMcpToolModes } from '@/lib/mcp/remote';
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

  const server = await getMcpServerById({
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

  await resetMcpToolModes({ serverId, userId: body.user.id });

  let error: string | undefined;
  let definitions: ListToolsResult | undefined;
  let toolModes: McpToolModeMap = {};
  try {
    const synced = await syncMcpToolModes({
      server,
      teamId: body.team?.id,
      userId: body.user.id,
    });
    definitions = synced.definitions;
    toolModes = synced.modes;
  } catch (err) {
    error = errorMessage(err);
    await updateMcpServer({
      id: server.id,
      userId: body.user.id,
      values: {
        enabled: false,
        lastError: error,
      },
    });
    await publishHome({ client, userId: body.user.id });
  }

  await client.views.update({
    view_id: viewId,
    view: toolsModal({
      error,
      serverId,
      serverName: server.name,
      toolModes,
      tools: definitions?.tools ?? [],
    }),
  });
}
