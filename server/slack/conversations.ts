import type { ModelMessage, UserContent } from 'ai';
import logger from '~/lib/logger';
import type { ConversationOptions, SlackConversationMessage } from '~/types';
import { toLogError } from '~/utils/error';
import { processSlackFiles } from '~/utils/images';
import { isUsableMessage } from '~/utils/messages';

interface CachedUser {
  displayName: string;
  id: string;
  realName?: string;
  username?: string;
}

async function joinChannel(
  client: ConversationOptions['client'],
  channel: string
): Promise<void> {
  try {
    // keep previous behavior: best-effort join and swallow failures
    await fetch('https://slack.com/api/conversations.join', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${client.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel }),
    });
  } catch {
    // this is fine - channel may not support join
  }
}

async function fetchMessages(
  options: ConversationOptions
): Promise<SlackConversationMessage[]> {
  const {
    client,
    channel,
    threadTs,
    limit = 40,
    latest,
    oldest,
    inclusive = false,
  } = options;

  const response = threadTs
    ? await client.conversations.replies({
        channel,
        ts: threadTs,
        limit,
        latest,
        oldest,
        inclusive,
      })
    : await client.conversations.history({
        channel,
        limit,
        latest,
        oldest,
        inclusive,
      });

  return (response.messages as SlackConversationMessage[] | undefined) ?? [];
}

function filterMessages(
  messages: SlackConversationMessage[],
  latest: string | undefined,
  inclusive: boolean
): SlackConversationMessage[] {
  if (!latest) {
    return messages;
  }

  return messages.filter((message) => {
    if (!message.ts) {
      return false;
    }
    if (!isUsableMessage(message.text || '')) {
      return false;
    }
    const messageTs = Number(message.ts);
    const latestTs = Number(latest);
    return inclusive ? messageTs <= latestTs : messageTs < latestTs;
  });
}

async function buildUserCache(
  client: ConversationOptions['client'],
  messages: SlackConversationMessage[]
): Promise<Map<string, CachedUser>> {
  const userIds = new Set<string>();
  for (const message of messages) {
    if (message.user) {
      userIds.add(message.user);
    }
  }

  const userCache = new Map<string, CachedUser>();
  await Promise.all(
    Array.from(userIds).map(async (userId) => {
      try {
        const info = await client.users.info({ user: userId });
        const displayName =
          info.user?.profile?.display_name ||
          info.user?.real_name ||
          info.user?.name ||
          userId;
        userCache.set(userId, {
          id: userId,
          displayName,
          realName: info.user?.real_name || undefined,
          username: info.user?.name || undefined,
        });
      } catch (error) {
        logger.warn(
          { ...toLogError(error), userId },
          'Failed to fetch Slack user info'
        );
        userCache.set(userId, {
          id: userId,
          displayName: userId,
        });
      }
    })
  );

  return userCache;
}

function sortForModel(messages: SlackConversationMessage[]) {
  return messages
    .filter(
      (message) =>
        !message.subtype ||
        message.subtype === 'file_share' ||
        message.subtype === 'bot_message'
    )
    .sort((a, b) => {
      const aTs = Number(a.ts ?? '0');
      const bTs = Number(b.ts ?? '0');
      return aTs - bTs;
    });
}

async function toModelMessage(
  message: SlackConversationMessage,
  options: {
    botUserId?: string;
    mentionRegex: RegExp | null;
    userCache: Map<string, CachedUser>;
  }
): Promise<ModelMessage> {
  const { botUserId, mentionRegex, userCache } = options;

  const isAssistantMessage =
    message.user === botUserId || Boolean(message.bot_id);
  const original = message.text ?? '';
  const cleaned = mentionRegex
    ? original.replace(mentionRegex, '').trim()
    : original.trim();
  const textContent = cleaned.length > 0 ? cleaned : original;

  const author = message.user
    ? (userCache.get(message.user)?.displayName ?? message.user)
    : (message.bot_id ?? 'unknown');
  const authorId = message.user ?? message.bot_id ?? 'unknown';

  const formattedText = `${author} (${authorId}): ${textContent}`;

  if (isAssistantMessage) {
    return {
      role: 'assistant' as const,
      content: formattedText,
    };
  }

  const imageContents = await processSlackFiles(message.files);
  if (imageContents.length > 0) {
    const contentParts: UserContent = [
      {
        type: 'text' as const,
        text: formattedText,
      },
      ...imageContents,
    ];

    return {
      role: 'user' as const,
      content: contentParts,
    };
  }

  return {
    role: 'user' as const,
    content: formattedText,
  };
}

export async function getConversationMessages({
  client,
  channel,
  threadTs,
  botUserId,
  limit = 40,
  latest,
  oldest,
  inclusive = false,
}: ConversationOptions): Promise<ModelMessage[]> {
  try {
    await joinChannel(client, channel);

    const mentionRegex = botUserId ? new RegExp(`<@${botUserId}>`, 'gi') : null;
    const messages = await fetchMessages({
      client,
      channel,
      threadTs,
      botUserId,
      limit,
      latest,
      oldest,
      inclusive,
    });
    const filteredMessages = filterMessages(messages, latest, inclusive);
    const userCache = await buildUserCache(client, filteredMessages);
    const sortedMessages = sortForModel(filteredMessages);

    return await Promise.all(
      sortedMessages.map((message) =>
        toModelMessage(message, { botUserId, mentionRegex, userCache })
      )
    );
  } catch (error) {
    logger.error(
      { ...toLogError(error), channel, threadTs },
      'Failed to fetch conversation history'
    );
    return [];
  }
}
