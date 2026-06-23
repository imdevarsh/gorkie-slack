import { slackMrkdwnToMarkdown } from '@chat-adapter/slack/format';
import type { Message } from 'chat';
import { bot } from '@/lib/chat';

const slackUserMentionPattern = /<@([A-Z0-9_]+)(?:\|([^<>]+))?>/g;

export async function buildAgentPromptText(message: Message): Promise<string> {
  const raw = message.raw;
  const rawText =
    raw &&
    typeof raw === 'object' &&
    'text' in raw &&
    typeof raw.text === 'string'
      ? raw.text
      : undefined;
  const prefix = `[${message.author.userName}: ${message.author.userId}]`;
  if (!rawText) {
    return `${prefix}: ${message.text}`;
  }

  const mentions = [...rawText.matchAll(slackUserMentionPattern)];
  if (mentions.length === 0) {
    return `${prefix}: ${slackMrkdwnToMarkdown(rawText)}`;
  }

  const mentionNames = new Map<string, string>();
  const mentionLookups: Promise<void>[] = [];

  for (const mention of mentions) {
    const userId = mention[1];
    const label = mention[2];
    if (!userId || mentionNames.has(userId)) {
      continue;
    }
    if (label) {
      mentionNames.set(userId, label);
      continue;
    }
    mentionLookups.push(
      bot.getUser(userId).then((user) => {
        mentionNames.set(userId, user?.userName ?? userId);
      })
    );
  }

  await Promise.all(mentionLookups);
  const annotatedText = rawText.replace(
    slackUserMentionPattern,
    (token, userId: string) => {
      const name = mentionNames.get(userId);
      return name ? `@${name} [${userId}]` : token;
    }
  );

  return `${prefix}: ${slackMrkdwnToMarkdown(annotatedText)}`;
}
