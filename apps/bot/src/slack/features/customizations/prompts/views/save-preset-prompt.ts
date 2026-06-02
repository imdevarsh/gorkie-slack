import { toLogError } from '@repo/utils/error';
import type {
  AllMiddlewareArgs,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
} from '@slack/bolt';
import logger from '@/lib/logger';
import { applyPrompt } from '../../publish';

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
    await applyPrompt({ client, userId, teamId: body.team?.id, prompt });
  } catch (error) {
    logger.warn(
      { ...toLogError(error), userId },
      'Failed to save preset prompt'
    );
  }
}
