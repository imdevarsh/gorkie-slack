import { personas } from '@repo/ai/prompts/chat/presets';
import type { ButtonArgs } from '../types';
import { buildPresetModal } from '../view';

export const name = 'modal_load_preset';

export async function execute({
  ack,
  action,
  body,
  client,
}: ButtonArgs): Promise<void> {
  await ack();
  const presetId = typeof action.value === 'string' ? action.value : '';
  const preset = personas.find((p) => p.id === presetId);
  if (!preset) {
    return;
  }
  await client.views.push({
    trigger_id: body.trigger_id,
    view: buildPresetModal(preset),
  });
}
