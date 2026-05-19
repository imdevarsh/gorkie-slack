import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { personas } from '~/lib/ai/prompts/chat/presets';
import { buildPromptModal } from '../view';

export const name = /^modal_set_preset_/;

export async function execute({
  ack,
  action,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const presetId = typeof action.value === 'string' ? action.value : '';
  const preset = personas.find((p) => p.id === presetId);
  const viewId = body.view?.id;
  if (!(preset && viewId)) {
    return;
  }
  await client.views.update({
    view_id: viewId,
    view: buildPromptModal(preset.prompt),
  });
}
