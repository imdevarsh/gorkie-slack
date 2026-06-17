import { postSlackMessage } from '@chat-adapter/slack/api';
import { env } from '@/env';
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
    .catch(() => undefined);

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

  await postSlackMessage({
    channel: event.channelId,
    text: "Hello! I'm now available in this channel. Mention me to get started.",
    token: env.SLACK_BOT_TOKEN,
  }).catch(() => undefined);
});
