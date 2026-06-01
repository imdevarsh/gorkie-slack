import {
  listMcpToolPermissions,
  upsertMcpToolPermission,
} from '@repo/db/queries';
import { asRecord } from '@repo/utils/record';
import { publishHome } from '../../publish';
import { inputs, views } from '../ids';
import type { ServerMeta, SubmitArgs } from '../types';

export const name = views.configure;
const TOOL_BLOCK_PREFIX = /^tool_/;

export async function execute({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  await ack();
  const meta = JSON.parse(view.private_metadata || '{}') as ServerMeta;
  if (!meta.serverId) {
    return;
  }

  const permissions = await listMcpToolPermissions({
    serverId: meta.serverId,
    userId: body.user.id,
  });
  const permissionById = new Map(
    permissions.map((permission) => [permission.id, permission])
  );

  for (const [blockId, fields] of Object.entries(view.state.values)) {
    const permissionId = blockId.replace(TOOL_BLOCK_PREFIX, '');
    const permission = permissionById.get(permissionId);
    const selected = asRecord(
      asRecord(fields)?.[inputs.toolMode]
    )?.selected_option;
    const value = asRecord(selected)?.value;
    if (
      !(
        permission &&
        (value === 'allow' || value === 'ask' || value === 'block')
      )
    ) {
      continue;
    }

    await upsertMcpToolPermission({
      mode: value,
      scope: 'global',
      serverId: meta.serverId,
      source: 'user',
      teamId: body.team?.id,
      threadTs: '',
      toolName: permission.toolName,
      userId: body.user.id,
    });
  }

  await publishHome(client, body.user.id);
}
