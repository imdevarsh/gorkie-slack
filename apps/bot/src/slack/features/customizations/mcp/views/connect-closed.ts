import { publishHome } from '../../publish';
import { views } from '../ids';
import type { CloseArgs } from '../types';

export const name = views.oauth;
export const viewType = 'view_closed' as const;

export async function execute({ ack, body, client }: CloseArgs): Promise<void> {
  await ack();
  await publishHome(client, body.user.id);
}
