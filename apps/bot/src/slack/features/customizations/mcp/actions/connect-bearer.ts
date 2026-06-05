import { getMcpServerById } from '@repo/db/queries';
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
  const serverId = action.value;
  if (!serverId) {
    return;
  }

  const server = await getMcpServerById({
    id: serverId,
    userId: body.user.id,
  });
  if (!server || server.authType !== 'bearer') {
    return;
  }

  await client.views
    .open({
      trigger_id: body.trigger_id,
      view: bearerModal({ serverId: server.id, serverName: server.name }),
    })
    .catch(() => undefined);
}
