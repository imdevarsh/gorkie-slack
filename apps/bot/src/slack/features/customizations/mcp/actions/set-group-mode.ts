import { getMCPServerById, getMCPToolModes } from '@repo/db/queries';
import type { MCPToolModeMap } from '@repo/db/schema';
import { asRecord } from '@repo/utils/record';
import { mcpToolModeInputSchema } from '@repo/validators';
import { groupBlock, toolBlock } from '../block-id';
import { actions, inputs } from '../ids';
import { parseToolsMeta } from '../schema';
import type { SelectArgs } from '../types';
import { toolsModal } from '../view';

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
  const viewId = view.id;

  const meta = parseToolsMeta({ metadata: view.private_metadata });
  const { serverId, nonce, search, tools } = meta;
  if (!(serverId && nonce && tools)) {
    return;
  }

  const prefix = groupBlock.decode(action.block_id);
  const mode = action.selected_option?.value;
  if (!(prefix && mode)) {
    return;
  }
  if (
    !(
      (prefix === 'ro' || prefix === 'dt' || prefix === 'gn') &&
      (mode === 'allow' || mode === 'ask' || mode === 'block')
    )
  ) {
    return;
  }

  const groupToolNames = new Set(
    Object.entries(tools)
      .filter(([, tool]) => tool.group === prefix)
      .map(([id]) => id)
  );

  const stateValues = asRecord(body.view?.state?.values) ?? {};

  const [server, current] = await Promise.all([
    getMCPServerById({ id: serverId, userId: body.user.id }),
    getMCPToolModes({ serverId, userId: body.user.id }),
  ]);
  if (!server) {
    return;
  }

  const toolModes: MCPToolModeMap = {};
  for (const [toolId, tool] of Object.entries(tools)) {
    if (groupToolNames.has(toolId)) {
      toolModes[tool.name] = mode;
      continue;
    }
    const block = asRecord(stateValues[toolBlock.encode(nonce, toolId)]);
    const selected = mcpToolModeInputSchema.parse(
      block?.[inputs.toolMode]
    ).selected_option;
    toolModes[tool.name] =
      selected?.value ?? current.global[tool.name] ?? 'ask';
  }

  await client.views
    .update({
      hash: view.hash,
      view_id: viewId,
      view: toolsModal({
        search,
        serverId,
        serverName: server.name,
        toolModes,
        tools: Object.values(tools),
      }),
    })
    .catch(() => undefined);
}
