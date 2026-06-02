import { randomUUID } from 'node:crypto';
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const askUserFlows = pgTable(
  'ask_user_flows',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => `que_${randomUUID()}`),
    userId: text('user_id').notNull(),
    teamId: text('team_id'),
    channelId: text('channel_id').notNull(),
    threadTs: text('thread_ts').notNull(),
    eventTs: text('event_ts').notNull(),
    messageTs: text('message_ts'),
    state: text('state').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('ask_user_flows_user_status_idx').on(table.userId, table.status),
  ]
);

export type AskUserFlowRecord = typeof askUserFlows.$inferSelect;
export type NewAskUserFlowRecord = typeof askUserFlows.$inferInsert;
