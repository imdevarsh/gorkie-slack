import { actions } from '../../ids';
import type { SelectArgs } from '../../types';
import { addModal } from '../../view';
import { parseAuthChangedPayload } from './schema';

export const name = actions.auth;

export async function execute({
  ack,
  body,
  client,
}: SelectArgs): Promise<void> {
  await ack();
  const view = body.view;
  if (!view?.id) {
    return;
  }

  await client.views.update({
    hash: view.hash,
    view: addModal(parseAuthChangedPayload({ view })),
    view_id: view.id,
  });
}
