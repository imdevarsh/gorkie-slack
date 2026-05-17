import type { App } from '@slack/bolt';
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
import logger from '~/lib/logger';
import { toLogError } from '~/utils/error';
import { buildHomeView, buildPromptModal } from './view';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

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

  app.action('home_cancel_task', async ({ ack, action, body, client }) => {
    await ack();
    const userId = body.user.id;
    const actionValue = asRecord(action)?.value;
    const taskId = typeof actionValue === 'string' ? actionValue : '';
    try {
      await cancelScheduledTaskForUser(taskId, userId);
      await publishHome(client, userId);
    } catch (error) {
      logger.warn(
        { ...toLogError(error), userId, taskId },
        'Failed to cancel task from App Home'
      );
    }
  });

  app.action('home_edit_prompt', async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    const currentPrompt = await getUserPrompt(userId).catch(() => null);
    const triggerId = asRecord(body)?.trigger_id;

    await client.views.open({
      trigger_id: typeof triggerId === 'string' ? triggerId : '',
      view: buildPromptModal(currentPrompt),
    });
  });

  app.view('home_save_prompt', async ({ ack, view, body, client }) => {
    await ack();
    const userId = body.user.id;
    const promptInput = asRecord(
      view.state.values.prompt_block?.prompt_input
    )?.value;
    const prompt = (typeof promptInput === 'string' ? promptInput : '').trim();

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
  });

  app.action('home_clear_prompt', async ({ ack, body, client }) => {
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
}
