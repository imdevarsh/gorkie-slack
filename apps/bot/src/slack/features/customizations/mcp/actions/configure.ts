import type { ListToolsResult } from '@ai-sdk/mcp';
import { getMCPServerById, updateMCPServer } from '@repo/db/queries';
import type { MCPToolModeMap } from '@repo/db/schema';
import { errorMessage } from '@repo/utils/error';
import { syncMCPToolModes } from '@/lib/mcp/remote';
import { publishHome } from '../../publish';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';
import { statusModal, toolsModal } from '../view';

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
  const opened = await client.views.open({
    trigger_id: body.trigger_id,
    view: statusModal({
      title: 'MCP Tools',
      text: 'Loading tools...',
    }),
  });
  const viewId = opened.view?.id;
  if (!viewId) {
    return;
  }

  const server = await getMCPServerById({
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

  let error: string | undefined;
  let definitions: ListToolsResult | undefined;
  let toolModes: MCPToolModeMap = {};
  try {
    const synced = await syncMCPToolModes({
      server,
      teamId: body.team?.id,
      userId: body.user.id,
    });
    definitions = synced.definitions;
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
