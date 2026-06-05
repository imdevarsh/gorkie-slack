import { getUserCustomization } from '@repo/db/queries';
import { toLogError } from '@repo/utils/error';
import logger from '@/lib/logger';
import type { ButtonArgs } from '../types';
import { buildPromptModal } from '../view';

export const name = 'home_edit_prompt';

export async function execute({
  ack,
  body,
  client,
}: ButtonArgs): Promise<void> {
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
