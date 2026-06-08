import { getMCPServerById, updateMCPServer } from '@repo/db/queries';
import { publishHome } from '../../publish';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';
import { statusModal, toolsModal } from '../view';
import { syncToolsForView } from './helpers';

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
      hash: opened.view?.hash,
      view_id: viewId,
      view: statusModal({
        title: 'MCP Tools',
        text: 'Could not find this MCP server.',
      }),
    });
    return;
  }

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
  await client.views.update({
    hash: opened.view?.hash,
    view_id: viewId,
    view: toolsModal({
      error,
      serverId,
      serverName: server.name,
      toolModes,
      tools: toolEntries,
    }),
  });
}
