import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const channelTopicSummaries = pgTable('channel_topic_summaries', {
  channelId: text('channel_id').primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  prefix: text('prefix'),
  postfix: text('postfix'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ChannelTopicSummary = typeof channelTopicSummaries.$inferSelect;
