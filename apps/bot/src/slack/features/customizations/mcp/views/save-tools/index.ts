import { getMCPServerById, patchMCPToolModes } from '@repo/db/queries';
import type { MCPToolModeMap } from '@repo/db/schema';
import { publishHome } from '../../../publish';
import { toolBlock } from '../../block-id';
import { inputs, views } from '../../ids';
import { parseToolsMeta, toolModeInputSchema } from '../../schema';
import type { SubmitArgs } from '../../types';

export const name = views.configure;

export async function execute({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  await ack();
  const { serverId, tools } = parseToolsMeta({
    metadata: view.private_metadata,
  });
  if (!(serverId && tools)) {
    return;
  }
  const server = await getMCPServerById({ id: serverId, userId: body.user.id });
  if (!server) {
    return;
  }
  const modes = Object.entries(view.state.values).flatMap(
    ([blockId, fields]) => {
      const toolId = toolBlock.decode(blockId);
      const toolName = toolId ? tools[toolId]?.name : null;
      if (!toolName) {
        return [];
      }
      const selected = toolModeInputSchema.parse(
        fields[inputs.toolMode]
      ).selected_option;
      return selected?.value ? [{ mode: selected.value, toolName }] : [];
    }
  );

  const toolModes: MCPToolModeMap = {};
  for (const item of modes) {
    toolModes[item.toolName] = item.mode;
  }
  await patchMCPToolModes({
    modes: toolModes,
    scope: 'global',
    serverId,
    teamId: body.team?.id,
    userId: body.user.id,
  });

  await publishHome({ client, userId: body.user.id });
}
