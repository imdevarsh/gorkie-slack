import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
  StaticSelectAction,
} from '@slack/bolt';
import { buildMcpAddModal, type McpAddModalState } from '../view';

export const name = 'auth_input';

function readState(
  view: SlackActionMiddlewareArgs<
    BlockAction<StaticSelectAction>
  >['body']['view']
): McpAddModalState {
  const values = view?.state.values;
  const authType =
    values?.auth_block?.auth_input?.selected_option?.value === 'bearer'
      ? 'bearer'
      : 'oauth';
  const transport =
    values?.transport_block?.transport_input?.selected_option?.value === 'sse'
      ? 'sse'
      : 'http';

  return {
    authType,
    bearerToken: values?.bearer_block?.bearer_input?.value?.trim() ?? '',
    clientId: values?.client_id_block?.client_id_input?.value?.trim() ?? '',
    name: values?.name_block?.name_input?.value?.trim() ?? '',
    transport,
    url: values?.url_block?.url_input?.value?.trim() ?? '',
  };
}

export async function execute({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<StaticSelectAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const view = body.view;
  if (!view?.id) {
    return;
  }

  await client.views.update({
    hash: view.hash,
    view: buildMcpAddModal(readState(view)),
    view_id: view.id,
  });
}
