import type { App } from '@slack/bolt';
import logger from '~/lib/logger';
import { toLogError } from '~/utils/error';

const promptsWithoutChannel = [
  { title: 'Search the web', message: 'Search the web for ' },
  { title: 'Write and run code', message: 'Write and run code to ' },
  { title: 'Generate an image', message: 'Create an image of ' },
  { title: 'Set a reminder', message: 'Remind me to ' },
];

const promptsWithChannel = [
  {
    title: 'Summarize this channel',
    message: 'Please summarize recent activity in this channel.',
  },
  {
    title: 'Search Slack',
    message: 'Search for messages about ',
  },
  {
    title: 'Write and run code',
    message: 'Write and run code to ',
  },
  {
    title: 'Generate an image',
    message: 'Create an image of ',
  },
];

export function register(app: App): void {
  app.event('assistant_thread_started', async ({ event, client }) => {
    const { channel_id, thread_ts, context } = event.assistant_thread;

    try {
      const prompts = context.channel_id
        ? promptsWithChannel
        : promptsWithoutChannel;

      await client.assistant.threads.setSuggestedPrompts({
        channel_id,
        thread_ts,
        prompts,
      });
    } catch (error) {
      logger.warn(
        { ...toLogError(error), channel: channel_id },
        'Failed to set suggested prompts'
      );
    }
  });
}
