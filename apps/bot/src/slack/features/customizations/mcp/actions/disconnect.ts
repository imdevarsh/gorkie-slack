import {
  deleteMcpConnections,
  getMcpServerByIdForUser,
  updateMcpServerForUser,
} from '@repo/db/queries';
import { publishHome } from '../../publish';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';

export const name = actions.disconnect;

export async function execute({
  ack,
  action,
  body,
  client,
}: ButtonArgs): Promise<void> {
  await ack();
  if (!action.value) {
    return;
  }
  const server = await getMcpServerByIdForUser({
    id: action.value,
    userId: body.user.id,
  });
  if (!server) {
    return;
  }
  await deleteMcpConnections({
    serverId: action.value,
    userId: body.user.id,
  });
  await updateMcpServerForUser({
    id: action.value,
    userId: body.user.id,
    values: { enabled: false, lastConnectedAt: null, lastError: null },
  });
  await publishHome(client, body.user.id);
}
