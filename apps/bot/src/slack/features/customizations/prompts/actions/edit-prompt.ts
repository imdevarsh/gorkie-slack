import { getUserCustomization } from '@repo/db/queries';
import { toLogError } from '@repo/utils/error';
import logger from '@/lib/logger';
import type { ButtonArgs } from '../types';
import { buildPromptLoadingModal, buildPromptModal } from '../view';

export const name = 'home_edit_prompt';

export async function execute({
  ack,
  body,
  client,
}: ButtonArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  const opened = await client.views
    .open({
      trigger_id: body.trigger_id,
      view: buildPromptLoadingModal(),
    })
    .catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), userId },
        'Failed to open prompt modal'
      );
      return null;
    });
  if (!opened) {
    return;
  }

  const viewId = opened.view?.id;
  if (!viewId) {
    logger.warn({ userId }, 'Prompt modal opened without view ID');
    return;
  }
  const currentCustomization = await getUserCustomization(userId).catch(
    (error) => {
      logger.warn(
        { ...toLogError(error), userId },
        'Failed to fetch customization for modal'
      );
      return null;
    }
  );
  await client.views
    .update({
      hash: opened.view?.hash,
      view_id: viewId,
      view: buildPromptModal({
        currentPrompt: currentCustomization?.prompt ?? null,
      }),
    })
    .catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), userId, viewId },
        'Failed to update prompt modal'
      );
    });
}
