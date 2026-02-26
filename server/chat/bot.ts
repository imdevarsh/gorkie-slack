import { createSlackAdapter, type SlackAdapter } from '@chat-adapter/slack';
import { createMemoryState } from '@chat-adapter/state-memory';
import { createRedisState } from '@chat-adapter/state-redis';
import { WebClient } from '@slack/web-api';
import { Chat, type Message, type Thread } from 'chat';
import { generateResponse } from '~/chat/respond';
import { env } from '~/env';
import {
  isUserAllowed,
  startAllowedUsersSync,
  stopAllowedUsersSync,
} from '~/lib/allowed-users';
import logger from '~/lib/logger';
import { buildChatContext, getContextId } from '~/utils/context';
import { logReply } from '~/utils/log';
import { shouldUse } from '~/utils/messages';
import { buildRuntimeContext } from './context';

const state =
  env.NODE_ENV === 'development'
    ? createMemoryState()
    : createRedisState({
        url: env.REDIS_URL,
        keyPrefix: 'gorkie-chat-sdk',
      });

const slack = createSlackAdapter();
const slackClient = new WebClient(env.SLACK_BOT_TOKEN);

export const bot = new Chat({
  userName: 'gorkie',
  adapters: { slack },
  state,
});

async function getAuthorName(context: { client: WebClient; userId?: string }) {
  const { userId } = context;
  if (!userId) {
    return 'unknown';
  }

  try {
    const info = await context.client.users.info({ user: userId });
    return (
      info.user?.profile?.display_name ||
      info.user?.real_name ||
      info.user?.name ||
      userId
    );
  } catch {
    return userId;
  }
}

async function processMessage(
  thread: Thread,
  message: Message,
  reason: string
) {
  if (message.author.isMe || message.author.isBot) {
    return;
  }

  if (!shouldUse(message.text)) {
    return;
  }

  const context = buildRuntimeContext({
    chat: bot,
    thread,
    message,
    slack,
    client: slackClient,
  });

  const ctxId = getContextId(context);
  const userId = context.userId;
  const authorName = await getAuthorName({ client: context.client, userId });

  if (!(userId && isUserAllowed(userId))) {
    if (reason !== 'mention') {
      return;
    }

    if (!env.OPT_IN_CHANNEL) {
      return;
    }

    await thread.post(
      `Hey there <@${userId}>! For security and privacy reasons, you must be in <#${env.OPT_IN_CHANNEL}> to talk to me. When you're ready, ping me again and we can talk!`
    );
    return;
  }

  const { messages, requestHints } = await buildChatContext(context);

  logger.info(
    {
      ctxId,
      channelId: context.channelId,
      threadId: context.threadId,
      userId,
      message: `${authorName}: ${message.text}`,
    },
    `Processing message from ${reason}`
  );

  const result = await generateResponse(context, messages, requestHints);
  logReply(ctxId, authorName, result, reason);
}

bot.onNewMention(async (thread, message) => {
  await thread.subscribe();
  await processMessage(thread, message, thread.isDM ? 'dm' : 'mention');
});

bot.onSubscribedMessage(async (thread, message) => {
  await processMessage(thread, message, thread.isDM ? 'dm-thread' : 'thread');
});

bot.onAssistantThreadStarted(async (event) => {
  const adapter = bot.getAdapter('slack') as SlackAdapter;
  await adapter
    .setSuggestedPrompts(event.channelId, event.threadTs, [
      {
        title: 'Summarize Thread',
        message: 'Please summarize the key points in this thread.',
      },
      {
        title: 'Draft Reply',
        message: 'Help me draft a concise reply to the latest message.',
      },
    ])
    .catch(() => null);
});

bot.onAssistantContextChanged((event) => {
  logger.debug(
    {
      channelId: event.channelId,
      threadId: event.threadId,
      userId: event.userId,
    },
    'Assistant context changed'
  );
});

export async function initializeBot(): Promise<void> {
  await bot.initialize();
  await startAllowedUsersSync(slackClient);
}

export async function shutdownBot(): Promise<void> {
  stopAllowedUsersSync();
  await bot.shutdown();
}
