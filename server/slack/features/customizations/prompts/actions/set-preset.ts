import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { setUserCustomization } from '~/db/queries/customizations';
import { personas } from '~/lib/ai/prompts/chat/presets';
import logger from '~/lib/logger';
import { toLogError } from '~/utils/error';
import { publishHome } from '../../publish';

export const name = /^home_set_preset_/;

export async function execute({
  ack,
  action,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  const presetId = typeof action.value === 'string' ? action.value : '';
  const preset = personas.find((p) => p.id === presetId);
  if (!preset) {
    return;
  }
  try {
    await setUserCustomization(userId, { prompt: preset.prompt });
    await publishHome(client, userId);
  } catch (error) {
    logger.warn(
      { ...toLogError(error), userId, presetId },
      'Failed to apply preset'
    );
  }
}
