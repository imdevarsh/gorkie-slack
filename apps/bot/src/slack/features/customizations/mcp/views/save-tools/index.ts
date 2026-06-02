import {
  listMcpToolPermissions,
  upsertMcpToolPermission,
} from '@repo/db/queries';
import { publishHome } from '../../../publish';
import { views } from '../../ids';
import type { SubmitArgs } from '../../types';
import { parseSaveToolsPayload } from './schema';

export const name = views.configure;

export async function execute({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  await ack();
  const payload = parseSaveToolsPayload({ view });
  if (!payload.serverId) {
    return;
  }

  const permissions = await listMcpToolPermissions({
    serverId: payload.serverId,
    userId: body.user.id,
  });
  const permissionById = new Map(
    permissions.map((permission) => [permission.id, permission])
  );

  for (const item of payload.modes) {
    const permission = permissionById.get(item.permissionId);
    if (!(permission && permission.mode !== item.mode)) {
      continue;
    }

    await upsertMcpToolPermission({
      mode: item.mode,
      scope: 'global',
      serverId: payload.serverId,
      source: 'user',
      teamId: body.team?.id,
      threadTs: '',
      toolName: permission.toolName,
      userId: body.user.id,
    });
  }

  await publishHome({ client, userId: body.user.id, teamId: body.team?.id });
}
