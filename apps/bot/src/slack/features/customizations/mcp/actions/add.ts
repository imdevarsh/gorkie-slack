import { actions } from '../ids';
import type { ButtonArgs } from '../types';
import { addModal } from '../view';

export const name = actions.add;

export async function execute({
  ack,
  body,
  client,
}: ButtonArgs): Promise<void> {
  await ack();
  await client.views.open({
    trigger_id: body.trigger_id,
    view: addModal(),
  });
}
