import { eq } from 'drizzle-orm';
import { db } from '../index';
import { channelTopicSummaries } from '../schema';

export async function getTopicSummaryConfig(channelId: string) {
  const result = await db
    .select({
      enabled: channelTopicSummaries.enabled,
      prefix: channelTopicSummaries.prefix,
      postfix: channelTopicSummaries.postfix,
    })
    .from(channelTopicSummaries)
    .where(eq(channelTopicSummaries.channelId, channelId))
    .limit(1);

  return result.length > 0 && result[0]
    ? result[0]
    : {
        enabled: false,
        prefix: null as string | null,
        postfix: null as string | null,
      };
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

export async function upsertTopicSummaryPrefix(
  channelId: string,
  prefix: string | null
): Promise<void> {
  await db
    .insert(channelTopicSummaries)
    .values({ channelId, prefix })
    .onConflictDoUpdate({
      target: channelTopicSummaries.channelId,
      set: { prefix },
    });
}

export async function upsertTopicSummaryPostfix(
  channelId: string,
  postfix: string | null
): Promise<void> {
  await db
    .insert(channelTopicSummaries)
    .values({ channelId, postfix })
    .onConflictDoUpdate({
      target: channelTopicSummaries.channelId,
      set: { postfix },
    });
}
