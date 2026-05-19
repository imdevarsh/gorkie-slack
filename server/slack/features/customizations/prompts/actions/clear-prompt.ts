import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { clearUserCustomization } from '~/db/queries/customizations';
import logger from '~/lib/logger';
import { toLogError } from '~/utils/error';
import { publishHome } from '../../publish';

export const name = 'home_clear_prompt';

export async function execute({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  try {
    await clearUserCustomization(userId);
    await publishHome(client, userId);
  } catch (error) {
    logger.warn(
      { ...toLogError(error), userId },
      'Failed to clear custom prompt'
    );
  }
}
