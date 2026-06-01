import { actions, blocks, inputs } from '../ids';
import type { ModalState, SelectArgs } from '../types';
import { addModal } from '../view';

export const name = actions.auth;

function readState(view: SelectArgs['body']['view']): ModalState {
  const values = view?.state.values;
  const auth =
    values?.[blocks.auth]?.[inputs.auth]?.selected_option?.value === 'bearer'
      ? 'bearer'
      : 'oauth';
  const transport =
    values?.[blocks.transport]?.[inputs.transport]?.selected_option?.value ===
    'sse'
      ? 'sse'
      : 'http';

  return {
    auth,
    bearerToken: values?.[blocks.bearer]?.[inputs.bearer]?.value?.trim() ?? '',
    clientId: values?.[blocks.clientId]?.[inputs.clientId]?.value?.trim() ?? '',
    name: values?.[blocks.name]?.[inputs.name]?.value?.trim() ?? '',
    transport,
    url: values?.[blocks.url]?.[inputs.url]?.value?.trim() ?? '',
  };
}

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
    view: addModal(readState(view)),
    view_id: view.id,
  });
}
