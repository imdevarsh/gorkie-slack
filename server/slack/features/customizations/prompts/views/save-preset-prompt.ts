import type {
  AllMiddlewareArgs,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
} from '@slack/bolt';
import {
  clearUserCustomization,
  setUserCustomization,
} from '~/db/queries/customizations';
import logger from '~/lib/logger';
import { toLogError } from '~/utils/error';
import { publishHome } from '../../publish';

export const name = 'home_save_preset_prompt';

export async function execute({
  ack,
  view,
  body,
  client,
}: SlackViewMiddlewareArgs<ViewSubmitAction> &
  AllMiddlewareArgs): Promise<void> {
  await ack({ response_action: 'clear' });
  const userId = body.user.id;
  const prompt =
    view.state.values.prompt_block?.prompt_input?.value?.trim() ?? '';
  try {
    if (prompt) {
      await setUserCustomization(userId, { prompt });
    } else {
      await clearUserCustomization(userId);
    }
    await publishHome(client, userId);
  } catch (error) {
    logger.warn(
      { ...toLogError(error), userId },
      'Failed to save preset prompt'
    );
  }
}
