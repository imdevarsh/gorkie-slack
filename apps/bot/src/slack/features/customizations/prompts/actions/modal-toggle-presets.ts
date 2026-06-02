import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { buildPromptModal, parseModalState } from '../view';

export const name = 'modal_toggle_presets';

export async function execute({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const viewId = body.view?.id;
  if (!viewId) {
    return;
  }
  const state = parseModalState(body.view?.private_metadata);
  await client.views.update({
    view_id: viewId,
    view: buildPromptModal({
      currentPrompt: null,
      state: { presetsOpen: !state.presetsOpen },
    }),
  });
}
