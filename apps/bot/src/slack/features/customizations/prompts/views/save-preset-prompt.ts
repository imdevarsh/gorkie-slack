import { toLogError } from '@repo/utils/error';
import logger from '@/lib/logger';
import { publishHome, savePrompt } from '../../publish';
import { parsePromptValue } from '../schema';
import type { SubmitArgs } from '../types';

export const name = 'home_save_preset_prompt';

export async function execute({
  ack,
  view,
  body,
  client,
}: SubmitArgs): Promise<void> {
  const userId = body.user.id;
  const prompt = parsePromptValue({ values: view.state.values });
  if (prompt === null) {
    await ack({
      errors: { prompt_block: 'Could not read custom instructions.' },
      response_action: 'errors',
    });
    return;
  }
  await ack({ response_action: 'clear' });

  try {
    await savePrompt({ prompt, userId });
  } catch (error) {
    logger.warn(
      { ...toLogError(error), userId },
      'Failed to save preset prompt'
    );
    return;
  }
  await publishHome({ client, userId }).catch((error: unknown) => {
    logger.warn({ ...toLogError(error), userId }, 'Failed to publish home');
  });
}
