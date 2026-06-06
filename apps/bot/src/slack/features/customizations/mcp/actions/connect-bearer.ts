import { getMCPServerById } from '@repo/db/queries';
import { toLogError } from '@repo/utils/error';
import logger from '@/lib/logger';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';
import { bearerModal } from '../view';

export const name = actions.connectBearer;

export async function execute({
  ack,
  action,
  body,
  client,
}: ButtonArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  const serverId = action.value;
  if (!serverId) {
    return;
  }

  const server = await getMCPServerById({
    id: serverId,
    userId,
  });
  if (!server || server.authType !== 'bearer') {
    return;
  }

  await client.views
    .open({
      trigger_id: body.trigger_id,
      view: bearerModal({ serverId: server.id, serverName: server.name }),
    })
    .catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), serverId: server.id, userId },
        'Failed to open MCP bearer modal'
      );
    });
}
