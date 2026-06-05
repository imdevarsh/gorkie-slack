import { getMcpServerById, hasMcpConnection } from '@repo/db/queries';
import logger from '@/lib/logger';
import { finalizeOAuthServer } from '@/lib/mcp/connection';
import { publishHome } from '../../../publish';
import { views } from '../../ids';
import { parseServerMeta } from '../../schema';
import type { CloseArgs } from '../../types';

export const name = views.oauth;

export async function execute({
  ack,
  body,
  client,
  view,
}: CloseArgs): Promise<void> {
  await ack();
  const serverId =
    parseServerMeta({ metadata: view.private_metadata }).serverId ?? null;

  const server = serverId
    ? await getMcpServerById({ id: serverId, userId: body.user.id })
    : null;

  if (server?.authType === 'oauth') {
    const hasCredentials = await hasMcpConnection({
      authType: server.authType,
      serverId: server.id,
      userId: body.user.id,
    });
    if (hasCredentials) {
      await finalizeOAuthServer({
        server,
        teamId: body.team?.id,
        userId: body.user.id,
      }).catch((error: unknown) => {
        logger.warn(
          { err: error, serverId: server.id },
          'MCP OAuth finalize failed'
        );
      });
    }
  }

  await publishHome({ client, userId: body.user.id });
}
