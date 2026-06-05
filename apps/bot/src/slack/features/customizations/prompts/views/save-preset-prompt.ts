import { toLogError } from '@repo/utils/error';
import logger from '@/lib/logger';
import { applyPrompt } from '../../publish';
import { parsePromptValue } from '../schema';
import type { SubmitArgs } from '../types';

export const name = 'home_save_preset_prompt';

export async function execute({
  ack,
  view,
  body,
  client,
}: SubmitArgs): Promise<void> {
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
