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

function getActionValue(action: unknown): string {
  const value = asRecord(action)?.value;
  return typeof value === 'string' ? value : '';
}

function getTriggerId(body: unknown): string {
  const triggerId = asRecord(body)?.trigger_id;
  return typeof triggerId === 'string' ? triggerId : '';
}

function getPlainTextInputValue(input: unknown): string | undefined {
  const value = asRecord(input)?.value;
  return typeof value === 'string' ? value : undefined;
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
    const taskId = getActionValue(action);
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

    await client.views.open({
      trigger_id: getTriggerId(body),
      view: buildPromptModal(currentPrompt),
    });
  });

  app.view('home_save_prompt', async ({ ack, view, body, client }) => {
    await ack();
    const userId = body.user.id;
    const promptInput = view.state.values.prompt_block?.prompt_input;
    const prompt = getPlainTextInputValue(promptInput)?.trim() ?? '';

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
