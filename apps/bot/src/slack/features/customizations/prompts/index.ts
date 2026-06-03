import { personas } from '@repo/ai/prompts/chat/presets';
import { getUserCustomization } from '@repo/db/queries';
import { toLogError } from '@repo/utils/error';
import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
} from '@slack/bolt';
import logger from '@/lib/logger';
import { applyPrompt } from '../publish';
import { parseModalState, parsePromptValue } from './schema';
import { buildPresetModal, buildPromptModal } from './view';

async function editPrompt({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  const currentCustomization = await getUserCustomization(userId).catch(
    (error) => {
      logger.warn(
        { ...toLogError(error), userId },
        'Failed to fetch customization for modal'
      );
      return null;
    }
  );
  await client.views.open({
    trigger_id: body.trigger_id,
    view: buildPromptModal({
      currentPrompt: currentCustomization?.prompt ?? null,
    }),
  });
}

async function clearPrompt({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  try {
    await applyPrompt({ client, userId, prompt: '' });
  } catch (error) {
    logger.warn({ ...toLogError(error), userId }, 'Failed to clear prompt');
  }
}

async function togglePresets({
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

async function loadPreset({
  ack,
  action,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
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

async function savePrompt({
  ack,
  view,
  body,
  client,
}: SlackViewMiddlewareArgs<ViewSubmitAction> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  const prompt = parsePromptValue({ values: view.state.values });
  try {
    await applyPrompt({ client, userId, prompt });
  } catch (error) {
    logger.warn({ ...toLogError(error), userId }, 'Failed to save prompt');
  }
}

async function savePresetPrompt({
  ack,
  view,
  body,
  client,
}: SlackViewMiddlewareArgs<ViewSubmitAction> &
  AllMiddlewareArgs): Promise<void> {
  await ack({ response_action: 'clear' });
  const userId = body.user.id;
  const prompt = parsePromptValue({ values: view.state.values });
  try {
    await applyPrompt({ client, userId, prompt });
  } catch (error) {
    logger.warn(
      { ...toLogError(error), userId },
      'Failed to save preset prompt'
    );
  }
}

export const prompts = {
  buttonActions: [
    { name: 'home_edit_prompt', execute: editPrompt },
    { name: 'home_clear_prompt', execute: clearPrompt },
    { name: 'modal_toggle_presets', execute: togglePresets },
    { name: 'modal_load_preset', execute: loadPreset },
  ],
  submitViews: [
    { name: 'home_save_prompt', execute: savePrompt },
    { name: 'home_save_preset_prompt', execute: savePresetPrompt },
  ],
};
