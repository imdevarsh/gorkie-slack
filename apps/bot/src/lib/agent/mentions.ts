import { bot } from '@/lib/chat';

const slackUserMentionPattern = /<@([A-Z0-9_]+)(?:\|([^<>]+))?>/g;

export async function annotateMentions(text: string): Promise<string> {
  const names = new Map<string, string>();
  const missingIds = new Set<string>();

  for (const mention of text.matchAll(slackUserMentionPattern)) {
    const userId = mention[1];
    const label = mention[2];
    if (!userId || names.has(userId)) {
      continue;
    }
    if (label) {
      names.set(userId, label);
      continue;
    }
    missingIds.add(userId);
  }

  await Promise.all(
    [...missingIds].map(async (userId) => {
      const user = await bot.getUser(userId).catch(() => undefined);
      names.set(userId, user?.userName ?? userId);
    })
  );

  if (names.size === 0) {
    return text;
  }
  return text.replace(slackUserMentionPattern, (token, userId: string) => {
    const name = names.get(userId);
    return name ? `@${name} (${userId})` : token;
  });
}
