import { eq } from 'drizzle-orm';
import { db } from '../index';
import { channelTopicSummaries } from '../schema';

export async function getTopicSummaryEnabled(
  channelId: string
): Promise<boolean> {
  const result = await db
    .select({ enabled: channelTopicSummaries.enabled })
    .from(channelTopicSummaries)
    .where(eq(channelTopicSummaries.channelId, channelId))
    .limit(1);

  return result.length > 0 ? (result[0]?.enabled ?? false) : false;
}

export async function upsertTopicSummaryEnabled(
  channelId: string,
  enabled: boolean
): Promise<void> {
  await db
    .insert(channelTopicSummaries)
    .values({ channelId, enabled })
    .onConflictDoUpdate({
      target: channelTopicSummaries.channelId,
      set: { enabled },
    });
}
