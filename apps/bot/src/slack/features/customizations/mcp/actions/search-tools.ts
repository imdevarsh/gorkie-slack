import { getMCPServerById } from '@repo/db/queries';
import type { MCPToolModeMap } from '@repo/db/schema';
import { errorMessage } from '@repo/utils/error';
import { syncMCPToolModes } from '@/lib/mcp/remote';
import { actions } from '../ids';
import { parseToolsMeta } from '../schema';
import type { InputArgs } from '../types';
import { toolsModal } from '../view';
import { toToolEntries } from '../view/tools';

export const name = actions.searchTools;

export async function execute({
  ack,
  action,
  body,
  client,
}: InputArgs): Promise<void> {
  await ack();

  const view = body.view;
  if (!view?.id) {
    return;
  }
  const viewId = view.id;

  const meta = parseToolsMeta({ metadata: view.private_metadata });
  const { serverId } = meta;
  if (!serverId) {
    return;
  }

  const search = action.value?.trim() || undefined;

  const server = await getMCPServerById({ id: serverId, userId: body.user.id });
  if (!server) {
    return;
  }

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
  }

  await client.views
    .update({
      hash: view.hash,
      view_id: viewId,
      view: toolsModal({
        error,
        search,
        serverId,
        serverName: server.name,
        toolModes,
        tools: toolEntries,
      }),
    })
    .catch(() => undefined);
}
