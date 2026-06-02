import {
  getMcpServerByIdForUser,
  updateMcpServerForUser,
} from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { syncMcpPermissions } from '@/lib/mcp/remote';
import { publishHome } from '../../../publish';
import { views } from '../../ids';
import { parsePrivateMetadata, serverMetaSchema } from '../../schema';
import type { CloseArgs } from '../../types';

export const name = views.oauth;

export async function execute({
  ack,
  body,
  client,
  view,
}: CloseArgs): Promise<void> {
  await ack();
  const meta = serverMetaSchema.safeParse(
    parsePrivateMetadata({ metadata: view.private_metadata })
  );
  const serverId = meta.success ? (meta.data.serverId ?? null) : null;

  const server = serverId
    ? await getMcpServerByIdForUser({ id: serverId, userId: body.user.id })
    : null;
  if (server) {
    try {
      await syncMcpPermissions({
        server,
        teamId: body.team?.id,
        userId: body.user.id,
      });
    } catch (error) {
      await updateMcpServerForUser({
        id: server.id,
        userId: body.user.id,
        values: {
          enabled: false,
          lastError: errorMessage(error),
        },
      });
    }
  }
  await publishHome({ client, userId: body.user.id, teamId: body.team?.id });
}
