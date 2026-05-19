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
import { asRecord } from '~/utils/record';
import { publishHome } from '../../publish';

export const name = 'home_save_prompt';

export async function execute({
  ack,
  view,
  body,
  client,
}: SlackViewMiddlewareArgs<ViewSubmitAction> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  const promptInput = asRecord(
    view.state.values.prompt_block?.prompt_input
  )?.value;
  const prompt = (typeof promptInput === 'string' ? promptInput : '').trim();
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
      'Failed to save custom prompt'
    );
  }
}
