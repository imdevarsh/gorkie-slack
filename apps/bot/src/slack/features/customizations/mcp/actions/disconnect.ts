import {
  deleteAllMCPToolModes,
  deleteMCPConnections,
  updateMCPServer,
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
  await deleteMCPConnections({
    serverId: action.value,
    userId: body.user.id,
  });
  await deleteAllMCPToolModes({
    serverId: action.value,
    userId: body.user.id,
  });
  await updateMCPServer({
    id: action.value,
    userId: body.user.id,
    values: { enabled: false, lastConnectedAt: null, lastError: null },
  });
  await publishHome({ client, userId: body.user.id });
}
