import { deleteMCPServer } from '@repo/db/queries';
import { publishHome } from '../../publish';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';

export const name = actions.delete;

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
  await deleteMCPServer({ id: action.value, userId: body.user.id });
  await publishHome({ client, userId: body.user.id });
}
