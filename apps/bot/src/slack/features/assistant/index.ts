import { toLogError } from '@repo/utils/error';
import { bot, slack } from '@/lib/chat';
import logger from '@/lib/logger';

bot.onAssistantThreadStarted(async (event) => {
  await slack
    .setSuggestedPrompts(event.channelId, event.threadTs, [
      {
        message: 'What are the top AI news stories today?',
        title: 'Search the web',
      },
      {
        message:
          'Write and run a Python script that plots a sine wave and sends me the image.',
        title: 'Write and run code',
      },
      {
        message: 'Generate an image of a futuristic city at night.',
        title: 'Generate an image',
      },
      {
        message:
          'Take a screenshot of https://example.com and describe what you see.',
        title: 'Browse a website',
      },
    ])
    .catch((error: unknown) => {
      logger.warn({ err: error }, 'Failed to set assistant suggested prompts');
    });
});

bot.onAssistantContextChanged(async (event) => {
  await slack
    .setAssistantStatus(event.channelId, event.threadTs, 'Updating context...')
    .catch((error: unknown) => {
      logger.warn(
        {
          ...toLogError(error),
          channelId: event.channelId,
          threadTs: event.threadTs,
        },
        'Failed to update assistant status'
      );
    });

  await slack
    .setSuggestedPrompts(event.channelId, event.threadTs, [
      {
        message: 'Summarize the recent activity in this channel.',
        title: 'Summarize this channel',
      },
      {
        message: 'Search Slack for recent messages about this project.',
        title: 'Search Slack',
      },
      {
        message:
          'Write and run a Python script that plots a sine wave and sends me the image.',
        title: 'Write and run code',
      },
      {
        message: 'Generate an image of a futuristic city at night.',
        title: 'Generate an image',
      },
    ])
    .catch((error: unknown) => {
      logger.warn(
        { err: error },
        'Failed to update assistant suggested prompts'
      );
    });
});

bot.onMemberJoinedChannel(async (event) => {
  if (event.userId !== slack.botUserId) {
    return;
  }

  await bot
    .channel(event.channelId)
    .post(
      "Hello! I'm now available in this channel. Mention me to get started."
    )
    .catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), channelId: event.channelId },
        'Failed to post channel join greeting'
      );
    });
});
