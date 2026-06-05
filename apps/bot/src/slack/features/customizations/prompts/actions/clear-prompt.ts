import { toLogError } from '@repo/utils/error';
import logger from '@/lib/logger';
import { applyPrompt } from '../../publish';
import type { ButtonArgs } from '../types';

export const name = 'home_clear_prompt';

export async function execute({
  ack,
  body,
  client,
}: ButtonArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  try {
    await applyPrompt({ client, userId, prompt: '' });
  } catch (error) {
    logger.warn({ ...toLogError(error), userId }, 'Failed to clear prompt');
  }
}
