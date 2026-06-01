import {
  getMcpServerByIdForUser,
  updateMcpServerForUser,
} from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { syncMcpToolPermissions } from '@/lib/mcp/remote';
import { publishHome } from '../../publish';
import { views } from '../ids';
import type { CloseArgs, ServerMeta } from '../types';

export const name = views.oauth;
export const viewType = 'view_closed' as const;

export async function execute({
  ack,
  body,
  client,
  view,
}: CloseArgs): Promise<void> {
  await ack();
  let serverId = '';
  try {
    const meta = JSON.parse(view.private_metadata || '{}') as ServerMeta;
    serverId = typeof meta.serverId === 'string' ? meta.serverId : '';
  } catch {
    serverId = '';
  }

  const server = serverId
    ? await getMcpServerByIdForUser({ id: serverId, userId: body.user.id })
    : null;
  if (server) {
    try {
      await syncMcpToolPermissions({
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
  await publishHome(client, body.user.id);
}
