import type {
  AllMiddlewareArgs,
  App,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import {
  clearUserCustomization,
  getUserCustomization,
  setUserCustomization,
} from '~/db/queries/customizations';
import { cancelScheduledTaskForUser } from '~/db/queries/scheduled-tasks';
import { personas } from '~/lib/ai/prompts/chat/presets';
import logger from '~/lib/logger';
import { toLogError } from '~/utils/error';
import { buildPromptModal } from './view';

type ActionArgs = SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs;

const HOME_SET_PRESET_REGEX = /^home_set_preset_/;

export function registerActions(
  app: App,
  publishHome: (client: ActionArgs['client'], userId: string) => Promise<void>
): void {
  app.action(
    'home_cancel_task',
    async ({ ack, action, body, client }: ActionArgs) => {
      await ack();
      const userId = body.user.id;
      const taskId = typeof action.value === 'string' ? action.value : '';
      try {
        await cancelScheduledTaskForUser(taskId, userId);
        await publishHome(client, userId);
      } catch (error) {
        logger.warn(
          { ...toLogError(error), userId, taskId },
          'Failed to cancel task from App Home'
        );
      }
    }
  );

  app.action('home_edit_prompt', async ({ ack, body, client }: ActionArgs) => {
    await ack();
    const userId = body.user.id;
    const currentCustomization = await getUserCustomization(userId).catch(
      () => null
    );
    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildPromptModal(currentCustomization?.prompt ?? null),
    });
  });

  app.action('home_clear_prompt', async ({ ack, body, client }: ActionArgs) => {
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
  });

  app.action(
    HOME_SET_PRESET_REGEX,
    async ({ ack, action, body, client }: ActionArgs) => {
      await ack();
      const userId = body.user.id;
      const presetId = typeof action.value === 'string' ? action.value : '';
      const preset = personas.find((p) => p.id === presetId);
      if (!preset) {
        return;
      }
      try {
        await setUserCustomization(userId, { prompt: preset.prompt });
        await publishHome(client, userId);
      } catch (error) {
        logger.warn(
          { ...toLogError(error), userId, presetId },
          'Failed to apply preset'
        );
      }
    }
  );
}
