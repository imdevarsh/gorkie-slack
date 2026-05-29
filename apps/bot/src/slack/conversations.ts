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
    if (message.text?.startsWith('##')) {
      return false;
    }
    const messageTs = Number(message.ts);
    const latestTs = Number(latest);
    return inclusive ? messageTs <= latestTs : messageTs < latestTs;
  });
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
    client: ConversationOptions['client'];
    botUserId?: string;
    mentionRegex: RegExp | null;
  }
): Promise<ModelMessage> {
  const { client, botUserId, mentionRegex } = options;

  const isAssistantMessage =
    message.user === botUserId || Boolean(message.bot_id);
  const original = message.text ?? '';
  const cleaned = mentionRegex
    ? original.replace(mentionRegex, '').trim()
    : original.trim();
  const textContent = cleaned.length > 0 ? cleaned : original;

  const authorId = message.user ?? message.bot_id ?? 'unknown';
  const author = message.user
    ? await getSlackUserName(client, message.user)
    : (message.bot_id ?? 'unknown');

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
    const sortedMessages = sortForModel(filterMessages(messages, latest, inclusive));
    const modelMessages: ModelMessage[] = [];
    for (const message of sortedMessages) {
      modelMessages.push(
        await toModelMessage(message, { client, botUserId, mentionRegex })
      );
    }
    return modelMessages;
  } catch (error) {
    logger.error(
      { ...toLogError(error), channel, threadTs },
      'Failed to fetch conversation history'
    );
    return [];
  }
}
