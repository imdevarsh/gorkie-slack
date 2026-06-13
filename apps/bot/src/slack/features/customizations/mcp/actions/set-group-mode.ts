import { getMCPServerById, patchMCPToolModes } from '@repo/db/queries';
import type { MCPToolModeMap } from '@repo/db/schema';
import { mcpGroupSlugSchema, mcpToolModeSchema } from '@repo/validators';
import { formatToolName } from '@/lib/mcp/format-tool-name';
import { groupBlock } from '../block-id';
import { actions } from '../ids';
import { parseToolsMeta } from '../schema';
import type { SelectArgs } from '../types';
import { toolsModal } from '../view';
import { syncToolsForView } from './helpers';

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

  const { search, serverId } = parseToolsMeta({
    metadata: view.private_metadata,
  });
  if (!serverId) {
    return;
  }

  const groupParsed = mcpGroupSlugSchema.safeParse(
    groupBlock.decode(action.block_id)
  );
  const modeParsed = mcpToolModeSchema.safeParse(action.selected_option?.value);
  if (!(groupParsed.success && modeParsed.success)) {
    return;
  }
  const group = groupParsed.data;
  const mode = modeParsed.data;

  const server = await getMCPServerById({ id: serverId, userId: body.user.id });
  if (!server) {
    return;
  }

  const { error, toolEntries, toolModes } = await syncToolsForView({
    server,
    teamId: body.team?.id,
    userId: body.user.id,
  });

  if (error) {
    await client.views
      .update({
        hash: view.hash,
        view_id: view.id,
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
    return;
  }

  // When a search is active, "Set all" only affects the substring-matched
  // tools that are actually visible — same predicate as the modal's filter.
  const needle = search?.trim().toLowerCase() || undefined;
  const targetNames = toolEntries
    .filter((tool) => tool.group === group)
    .filter(
      (tool) =>
        !needle ||
        tool.name.toLowerCase().includes(needle) ||
        formatToolName(tool.name).toLowerCase().includes(needle)
    )
    .map((tool) => tool.name);

  if (targetNames.length === 0) {
    return;
  }

  const groupModes: MCPToolModeMap = {};
  for (const toolName of targetNames) {
    groupModes[toolName] = mode;
  }

  await patchMCPToolModes({
    modes: groupModes,
    serverId,
    teamId: body.team?.id,
    userId: body.user.id,
  });

  await client.views
    .update({
      hash: view.hash,
      view_id: view.id,
      view: toolsModal({
        search,
        serverId,
        serverName: server.name,
        toolModes: { ...toolModes, ...groupModes },
        tools: toolEntries,
      }),
    })
    .catch(() => undefined);
}
