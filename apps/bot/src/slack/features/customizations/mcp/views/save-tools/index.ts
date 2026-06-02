import {
  listMcpToolPermissions,
  upsertMcpToolPermission,
} from '@repo/db/queries';
import { z } from 'zod';
import { publishHome } from '../../../publish';
import { inputs, views } from '../../ids';
import { parseServerMeta } from '../../schema';
import type { SubmitArgs } from '../../types';

export const name = views.configure;

const toolModeSchema = z
  .looseObject({
    selected_option: z
      .looseObject({
        value: z.enum(['allow', 'ask', 'block']),
      })
      .nullish(),
  })
  .catch({});

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
      if (!blockId.startsWith('tool_')) {
        return [];
      }
      const selected = toolModeSchema.parse(
        fields[inputs.toolMode]
      ).selected_option;
      return selected?.value
        ? [
            {
              mode: selected.value,
              permissionId: blockId.slice('tool_'.length),
            },
          ]
        : [];
    }
  );

  const permissions = await listMcpToolPermissions({
    serverId,
    userId: body.user.id,
  });
  const permissionById = new Map(
    permissions.map((permission) => [permission.id, permission])
  );

  for (const item of modes) {
    const permission = permissionById.get(item.permissionId);
    if (!(permission && permission.mode !== item.mode)) {
      continue;
    }

    await upsertMcpToolPermission({
      mode: item.mode,
      scope: 'global',
      serverId,
      source: 'user',
      teamId: body.team?.id,
      threadTs: '',
      toolName: permission.toolName,
      userId: body.user.id,
    });
  }

  await publishHome({ client, userId: body.user.id });
}
