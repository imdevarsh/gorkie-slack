import { getMCPServerById, patchMCPToolModes } from '@repo/db/queries';
import type { MCPToolModeMap } from '@repo/db/schema';
import { errorMessage } from '@repo/utils/error';
import { syncMCPToolModes } from '@/lib/mcp/remote';
import { groupBlock } from '../block-id';
import { actions } from '../ids';
import { parseToolsMeta } from '../schema';
import type { SelectArgs } from '../types';
import { toolsModal } from '../view';
import { toToolEntries } from '../view/tools';

export const name = actions.setGroupMode;

export async function execute({
  ack,
  action,
  body,
  client,
}: SelectArgs): Promise<void> {
  await ack();

  const view = body.view;
  if (!view?.id) {
    return;
  }

  const meta = parseToolsMeta({ metadata: view.private_metadata });
  const { page, search, serverId, tools } = meta;
  if (!(serverId && tools)) {
    return;
  }

  const prefix = groupBlock.decode(action.block_id);
  const mode = action.selected_option?.value;
  if (
    !(
      (prefix === 'ro' || prefix === 'dt' || prefix === 'gn') &&
      (mode === 'allow' || mode === 'ask' || mode === 'block')
    )
  ) {
    return;
  }

  const groupModes: MCPToolModeMap = {};
  for (const tool of Object.values(tools)) {
    if (tool.group === prefix) {
      groupModes[tool.name] = mode;
    }
  }
  if (Object.keys(groupModes).length === 0) {
    return;
  }

  const [server] = await Promise.all([
    getMCPServerById({ id: serverId, userId: body.user.id }),
    patchMCPToolModes({
      modes: groupModes,
      scope: 'global',
      serverId,
      teamId: body.team?.id,
      userId: body.user.id,
    }),
  ]);
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
      view_id: view.id,
      view: toolsModal({
        error,
        page,
        search,
        serverId,
        serverName: server.name,
        toolModes,
        tools: toolEntries,
      }),
    })
    .catch(() => undefined);
}
