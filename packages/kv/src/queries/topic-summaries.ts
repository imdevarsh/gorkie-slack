import { redis } from '../client';

const enabledKey = (channelId: string) =>
  `channel:${channelId}:topic_summaries_enabled`;
const countKey = (channelId: string) =>
  `channel:${channelId}:topic_summaries_count`;
const cooldownKey = (channelId: string) =>
  `channel:${channelId}:topic_summaries_cooldown`;

export async function checkAndSetCooldown(
  channelId: string,
  seconds: number
): Promise<boolean> {
  const result = await redis.set(
    cooldownKey(channelId),
    '1',
    'EX',
    seconds.toString(),
    'NX'
  );
  return result === 'OK';
}

export async function getCachedEnabled(
  channelId: string
): Promise<boolean | null> {
  const cached = await redis.get(enabledKey(channelId));
  if (cached === '1') {
    return true;
  }
  if (cached === '0') {
    return false;
  }
  return null;
}

export async function setCachedEnabled(
  channelId: string,
  enabled: boolean
): Promise<void> {
  await redis.set(enabledKey(channelId), enabled ? '1' : '0');
}

export function incrementMessageCount(channelId: string): Promise<number> {
  return redis.incr(countKey(channelId));
}
