import { setMCPToolModes } from '@repo/db/queries';
import type { MCPToolModeMap } from '@repo/db/schema';
import { publishHome } from '../../../publish';
import { toolBlock } from '../../block-id';
import { inputs, views } from '../../ids';
import { parseServerMeta, toolModeInputSchema } from '../../schema';
import type { SubmitArgs } from '../../types';

export const name = views.configure;

export async function execute({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  await ack();
  const serverId =
    parseServerMeta({ metadata: view.private_metadata }).serverId ?? null;
  if (!serverId) {
    return;
  }
  const modes = Object.entries(view.state.values).flatMap(
    ([blockId, fields]) => {
      const toolName = toolBlock.decode(blockId);
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
  await setMCPToolModes({
    modes: toolModes,
    scope: 'global',
    serverId,
    teamId: body.team?.id,
    userId: body.user.id,
  });

  await publishHome({ client, userId: body.user.id });
}
