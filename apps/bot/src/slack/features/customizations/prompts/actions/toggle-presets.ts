import { parseModalState, parsePromptValue } from '../schema';
import type { ButtonArgs } from '../types';
import { buildPromptModal } from '../view';

export const name = 'modal_toggle_presets';

export async function execute({
  ack,
  body,
  client,
}: ButtonArgs): Promise<void> {
  await ack();
  const viewId = body.view?.id;
  if (!viewId) {
    return;
  }
  const state = parseModalState({
    metadata: body.view?.private_metadata,
  });
  const currentPrompt = parsePromptValue({
    values: body.view?.state.values,
  });
  await client.views.update({
    view_id: viewId,
    view: buildPromptModal({
      currentPrompt: currentPrompt || null,
      state: { showPresets: !state.showPresets },
    }),
  });
}
