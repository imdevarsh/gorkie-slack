import type { ListToolsResult } from '@ai-sdk/mcp';
import { getMcpServerById, getMcpToolModes } from '@repo/db/queries';
import type { McpToolModeMap } from '@repo/db/schema';
import { asRecord } from '@repo/utils/record';
import { groupBlock, toolBlock } from '../block-id';
import { actions, inputs } from '../ids';
import type { SelectArgs } from '../types';
import { toolsModal } from '../view';

export const name = actions.setGroupMode;

type GroupSlug = 'ro' | 'dt' | 'gn';
type ToolMode = 'allow' | 'ask' | 'block';

function parseMeta(raw: string | undefined): {
  serverId?: string;
  groups?: Record<string, GroupSlug>;
  nonce?: string;
} {
  try {
    return JSON.parse(raw ?? '{}');
  } catch {
    return {};
  }
}

function selectedMode(
  values: Record<string, unknown>,
  blockId: string
): ToolMode | null {
  const block = asRecord(values[blockId]);
  const field = asRecord(block?.[inputs.toolMode]);
  const selected = asRecord(field?.selected_option);
  const value = selected?.value;
  return value === 'allow' || value === 'ask' || value === 'block'
    ? value
    : null;
}

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

  const meta = parseMeta(body.view?.private_metadata);
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
    getMcpServerById({ id: serverId, userId: body.user.id }),
    getMcpToolModes({ serverId, userId: body.user.id }),
  ]);
  if (!server) {
    return;
  }

  const toolModes: McpToolModeMap = {};
  for (const toolName of Object.keys(groups)) {
    if (groupToolNames.has(toolName)) {
      toolModes[toolName] = mode;
      continue;
    }
    toolModes[toolName] =
      selectedMode(stateValues, toolBlock.encode(nonce, toolName)) ??
      current.global[toolName] ??
      'ask';
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
