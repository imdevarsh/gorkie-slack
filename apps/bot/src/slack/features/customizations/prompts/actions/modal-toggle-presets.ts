import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { buildPromptModal } from '../view';

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
  let state = { showPresets: false };
  if (body.view?.private_metadata) {
    try {
      const parsed = JSON.parse(body.view.private_metadata);
      if (parsed && typeof parsed.showPresets === 'boolean') {
        state = { showPresets: parsed.showPresets };
      }
    } catch {
      state = { showPresets: false };
    }
  }
  const currentPrompt =
    body.view?.state.values.prompt_block?.prompt_input?.value?.trim() ?? null;
  await client.views.update({
    view_id: viewId,
    view: buildPromptModal({
      currentPrompt,
      state: { showPresets: !state.showPresets },
    }),
  });
}
