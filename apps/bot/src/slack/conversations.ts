import { toLogError } from '@repo/utils/error';
import type { ModelMessage, UserContent } from 'ai';
import logger from '@/lib/logger';
import type { ConversationOptions, SlackConversationMessage } from '@/types';
import { processSlackFiles } from '@/utils/images';
import { getSlackUserName } from '@/utils/users';

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

export async function fetchMessages(
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

  await joinChannel(client, channel);

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

async function toModelMessage(
  message: SlackConversationMessage,
  options: {
    botUserId?: string;
    mentionRegex: RegExp | null;
    userCache: Map<string, string>;
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
    ? (userCache.get(message.user) ?? message.user)
    : (message.bot_id ?? 'unknown');
  const authorId = message.user ?? message.bot_id ?? 'unknown';

  const formattedText = `${author} (${authorId}): ${textContent}`;

  if (isAssistantMessage) {
    return { role: 'assistant', content: formattedText };
  }

  const images = await processSlackFiles(message.files);
  return {
    role: 'user',
    content: (images.length
      ? [{ type: 'text', text: formattedText }, ...images]
      : formattedText) as UserContent,
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
    const mentionRegex = botUserId ? new RegExp(`<@${botUserId}>`, 'gi') : null;

    const raw = await fetchMessages({
      client,
      channel,
      threadTs,
      botUserId,
      limit,
      latest,
      oldest,
      inclusive,
    });

    const messages = latest
      ? raw.filter((m) => {
          if (!m.ts || m.text?.startsWith('##')) {
            return false;
          }
          const ts = Number(m.ts);
          const ref = Number(latest);
          return inclusive ? ts <= ref : ts < ref;
        })
      : raw;

    const userIds = new Set(
      messages.map((m) => m.user).filter(Boolean) as string[]
    );
    const userCache = new Map<string, string>();
    await Promise.all(
      Array.from(userIds).map(async (id) => {
        userCache.set(id, await getSlackUserName(client, id));
      })
    );

    const sorted = messages
      .filter(
        (m) =>
          !m.subtype ||
          m.subtype === 'file_share' ||
          m.subtype === 'bot_message'
      )
      .sort((a, b) => Number(a.ts ?? '0') - Number(b.ts ?? '0'));

    return await Promise.all(
      sorted.map((m) =>
        toModelMessage(m, { botUserId, mentionRegex, userCache })
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
