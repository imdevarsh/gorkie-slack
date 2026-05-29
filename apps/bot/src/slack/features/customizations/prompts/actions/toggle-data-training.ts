import { setUserDataTraining } from '@repo/db/queries';
import { toLogError } from '@repo/utils/error';
import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import logger from '@/lib/logger';
import { publishHome } from '../../publish';

export const name = 'home_toggle_data_training';

export async function execute({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  try {
    const buttonText = (body.actions[0] as ButtonAction).text.text;
    const allow = buttonText === 'Enable';
    await setUserDataTraining(userId, allow);
    await publishHome(client, userId);
  } catch (error) {
    logger.warn(
      { ...toLogError(error), userId },
      'Failed to toggle data training'
    );
  }
}
