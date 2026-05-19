import type {
  AllMiddlewareArgs,
  App,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
} from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import {
  cancelScheduledTaskForUser,
  listScheduledTasksByUser,
} from '~/db/queries/scheduled-tasks';
import {
  clearUserPrompt,
  getUserPrompt,
  setUserPrompt,
} from '~/db/queries/user-prompts';
import { PERSONAS } from '~/lib/ai/prompts/chat/presets';
import logger from '~/lib/logger';
import { toLogError } from '~/utils/error';
import { asRecord } from '~/utils/record';
import { buildHomeView, buildPromptModal } from './view';

type ActionArgs = SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs;
type ViewArgs = SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs;

async function publishHome(client: WebClient, userId: string): Promise<void> {
  const [tasks, userPrompt] = await Promise.all([
    listScheduledTasksByUser(userId),
    getUserPrompt(userId),
  ]);
  await client.views.publish({
    user_id: userId,
    view: buildHomeView(tasks, userPrompt),
  });
}

export function register(app: App): void {
  app.event('app_home_opened', async ({ event, client }) => {
    try {
      await publishHome(client, event.user);
    } catch (error) {
      logger.warn(
        { ...toLogError(error), userId: event.user },
        'Failed to publish App Home'
      );
    }
  });

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
    const currentPrompt = await getUserPrompt(userId).catch(() => null);
    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildPromptModal(currentPrompt),
    });
  });

  app.action('home_clear_prompt', async ({ ack, body, client }: ActionArgs) => {
    await ack();
    const userId = body.user.id;
    try {
      await clearUserPrompt(userId);
      await publishHome(client, userId);
    } catch (error) {
      logger.warn(
        { ...toLogError(error), userId },
        'Failed to clear custom prompt'
      );
    }
  });

  app.action(
    /^home_set_preset_/,
    async ({ ack, action, body, client }: ActionArgs) => {
      await ack();
      const userId = body.user.id;
      const presetId = typeof action.value === 'string' ? action.value : '';
      const preset = PERSONAS[presetId];
      if (!preset) {
        return;
      }
      try {
        await setUserPrompt(userId, preset.prompt);
        await publishHome(client, userId);
      } catch (error) {
        logger.warn(
          { ...toLogError(error), userId, presetId },
          'Failed to apply preset'
        );
      }
    }
  );

  app.view(
    'home_save_prompt',
    async ({ ack, view, body, client }: ViewArgs) => {
      await ack();
      const userId = body.user.id;
      const promptInput = asRecord(
        view.state.values.prompt_block?.prompt_input
      )?.value;
      const prompt = (
        typeof promptInput === 'string' ? promptInput : ''
      ).trim();
      try {
        if (prompt) {
          await setUserPrompt(userId, prompt);
        } else {
          await clearUserPrompt(userId);
        }
        await publishHome(client, userId);
      } catch (error) {
        logger.warn(
          { ...toLogError(error), userId },
          'Failed to save custom prompt'
        );
      }
    }
  );
}
