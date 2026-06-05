import type { ListToolsResult } from '@ai-sdk/mcp';
import { getMCPServerById, getMCPToolModes } from '@repo/db/queries';
import type { MCPToolModeMap } from '@repo/db/schema';
import { asRecord } from '@repo/utils/record';
import { groupBlock, toolBlock } from '../block-id';
import { actions, inputs } from '../ids';
import { parseToolsMeta, toolModeInputSchema } from '../schema';
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

  const viewId = body.view?.id;
  if (!viewId) {
    return;
  }

  const meta = parseToolsMeta({ metadata: body.view?.private_metadata });
  const { serverId, groups, nonce } = meta;
  if (!(serverId && groups && nonce)) {
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
    Object.entries(groups)
      .filter(([, g]) => g === prefix)
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
  for (const toolName of Object.keys(groups)) {
    if (groupToolNames.has(toolName)) {
      toolModes[toolName] = mode;
      continue;
    }
    const block = asRecord(stateValues[toolBlock.encode(nonce, toolName)]);
    const selected = toolModeInputSchema.parse(
      block?.[inputs.toolMode]
    ).selected_option;
    toolModes[toolName] = selected?.value ?? current.global[toolName] ?? 'ask';
  }

  const syntheticTools: ListToolsResult['tools'] = Object.keys(groups).map(
    (toolName) => ({
      name: toolName,
      description: '',
      inputSchema: { type: 'object', properties: {} },
      annotations: {
        readOnlyHint: groups[toolName] === 'ro',
        destructiveHint: groups[toolName] === 'dt',
      },
    })
  );

  await client.views
    .update({
      view_id: viewId,
      view: toolsModal({
        serverId,
        serverName: server.name,
        toolModes,
        tools: syntheticTools,
      }),
    })
    .catch(() => undefined);
}
