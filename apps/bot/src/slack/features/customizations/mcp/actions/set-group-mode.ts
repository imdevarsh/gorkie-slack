import {
  getMcpServerByIdForUser,
  listMcpToolPermissions,
} from '@repo/db/queries';
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

  const prefix = groupBlock.decode(action.block_id) as GroupSlug | null;
  const mode = action.selected_option?.value as ToolMode | undefined;
  if (!(prefix && mode)) {
    return;
  }

  const groupPermIds = new Set(
    Object.entries(groups)
      .filter(([, g]) => g === prefix)
      .map(([id]) => id)
  );

  const stateValues =
    (body.view?.state?.values as
      | Record<string, Record<string, { selected_option?: { value?: string } }>>
      | undefined) ?? {};

  const [server, permissions] = await Promise.all([
    getMcpServerByIdForUser({ id: serverId, userId: body.user.id }),
    listMcpToolPermissions({ serverId, userId: body.user.id }),
  ]);
  if (!server) {
    return;
  }

  const globalPerms = permissions.filter((p) => p.scope === 'global');

  const overriddenPerms = globalPerms.map((p) => {
    if (groupPermIds.has(p.id)) {
      return { ...p, mode };
    }
    const currentMode =
      stateValues[toolBlock.encode(nonce, p.id)]?.[inputs.toolMode]
        ?.selected_option?.value;
    return currentMode === 'allow' ||
      currentMode === 'ask' ||
      currentMode === 'block'
      ? { ...p, mode: currentMode as ToolMode }
      : p;
  });

  const syntheticTools = permissions.map((p) => ({
    name: p.toolName,
    description: '',
    inputSchema: { type: 'object' as const, properties: {} },
    annotations: {
      readOnlyHint: groups[p.id] === 'ro',
      destructiveHint: groups[p.id] === 'dt',
    },
  }));

  await client.views
    .update({
      view_id: viewId,
      view: toolsModal({
        permissions: overriddenPerms,
        serverId,
        serverName: server.name,
        tools: syntheticTools,
      }),
    })
    .catch(() => undefined);
}
