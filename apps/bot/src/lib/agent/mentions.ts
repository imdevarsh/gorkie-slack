import { bot } from '@/lib/chat';

const mentionPattern = /<@([A-Z0-9_]+)(?:\|([^<>]+))?>/g;

export async function annotateMentions(text: string): Promise<string> {
  const mentionNames = new Map<string, string>();
  const missingIds = new Set<string>();

  for (const mention of text.matchAll(mentionPattern)) {
    const userId = mention[1];
    const label = mention[2];
    if (!userId || mentionNames.has(userId)) {
      continue;
    }
    if (label) {
      mentionNames.set(userId, label);
      continue;
    }
    missingIds.add(userId);
  }

  await Promise.all(
    [...missingIds].map(async (userId) => {
      const user = await bot.getUser(userId).catch(() => undefined);
      mentionNames.set(userId, user?.userName ?? userId);
    })
  );

  if (mentionNames.size === 0) {
    return text;
  }
  return text.replace(mentionPattern, (token, userId: string) => {
    const name = mentionNames.get(userId);
    return name ? `@${name} (${userId})` : token;
  });
}
