import { patchMCPToolModes } from '@repo/db/queries';
import { mcpToolModeSchema } from '@repo/validators';
import { toolBlock } from '../block-id';
import { inputs } from '../ids';
import { parseToolsMeta } from '../schema';
import type { SelectArgs } from '../types';

export const name = inputs.toolMode;

export async function execute({
  ack,
  action,
  body,
}: SelectArgs): Promise<void> {
  await ack();

  const view = body.view;
  if (!view) {
    return;
  }

  const { serverId, tools } = parseToolsMeta({
    metadata: view.private_metadata,
  });
  if (!(serverId && tools)) {
    return;
  }

  const toolId = toolBlock.decode(action.block_id);
  const tool = toolId ? tools[toolId] : undefined;
  if (!tool) {
    return;
  }

  const modeParsed = mcpToolModeSchema.safeParse(action.selected_option?.value);
  if (!modeParsed.success) {
    return;
  }
  const mode = modeParsed.data;

  await patchMCPToolModes({
    modes: { [tool.name]: mode },
    scope: 'global',
    serverId,
    teamId: body.team?.id,
    userId: body.user.id,
  });
}
