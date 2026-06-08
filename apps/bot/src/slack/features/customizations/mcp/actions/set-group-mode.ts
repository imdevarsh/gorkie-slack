import { getMCPToolModes, patchMCPToolModes } from '@repo/db/queries';
import type { MCPToolModeMap } from '@repo/db/schema';
import { mcpGroupSlugSchema, mcpToolModeSchema } from '@repo/validators';
import Fuse from 'fuse.js';
import { groupBlock } from '../block-id';
import { actions } from '../ids';
import { parseToolsMeta } from '../schema';
import type { SelectArgs } from '../types';
import { toolsModal } from '../view';
import type { ToolEntry } from '../view/tools';

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
  const { open, search, serverId, serverName, tools: toolsByGroup } = meta;
  if (!(serverId && serverName && toolsByGroup)) {
    return;
  }

  const prefixParsed = mcpGroupSlugSchema.safeParse(
    groupBlock.decode(action.block_id)
  );
  const modeParsed = mcpToolModeSchema.safeParse(action.selected_option?.value);
  if (!(prefixParsed.success && modeParsed.success)) {
    return;
  }
  const prefix = prefixParsed.data;
  const mode = modeParsed.data;

  const allGroupNames = toolsByGroup[prefix];
  const searchTerm = search?.trim() || undefined;

  const targetNames: string[] = searchTerm
    ? new Fuse(
        allGroupNames.map((n) => ({ name: n })),
        { keys: ['name'], threshold: 0.4 }
      )
        .search(searchTerm)
        .map((r) => r.item.name)
    : allGroupNames;

  if (targetNames.length === 0) {
    return;
  }

  const groupModes: MCPToolModeMap = {};
  for (const name of targetNames) {
    groupModes[name] = mode;
  }

  await patchMCPToolModes({
    modes: groupModes,
    scope: 'global',
    serverId,
    teamId: body.team?.id,
    userId: body.user.id,
  });

  const { global: toolModes } = await getMCPToolModes({
    serverId,
    userId: body.user.id,
  });

  const allToolEntries: ToolEntry[] = [
    ...toolsByGroup.ro.map((n) => ({ name: n, group: 'ro' as const })),
    ...toolsByGroup.dt.map((n) => ({ name: n, group: 'dt' as const })),
    ...toolsByGroup.gn.map((n) => ({ name: n, group: 'gn' as const })),
  ];

  await client.views
    .update({
      hash: view.hash,
      view_id: view.id,
      view: toolsModal({
        open,
        search,
        serverId,
        serverName,
        toolModes,
        tools: allToolEntries,
      }),
    })
    .catch(() => undefined);
}
