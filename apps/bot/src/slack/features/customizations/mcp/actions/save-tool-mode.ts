import { patchMCPToolModes } from '@repo/db/queries';
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

  const mode = action.selected_option?.value;
  if (!(mode === 'allow' || mode === 'ask' || mode === 'block')) {
    return;
  }

  await patchMCPToolModes({
    modes: { [tool.name]: mode },
    scope: 'global',
    serverId,
    teamId: body.team?.id,
    userId: body.user.id,
  });
}
