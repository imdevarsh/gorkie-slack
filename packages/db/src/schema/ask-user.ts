import { randomUUID } from 'node:crypto';
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const askUserApprovals = pgTable(
  'ask_user_approvals',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    approvalId: text('approval_id')
      .notNull()
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
    uniqueIndex('ask_user_approvals_approval_idx').on(table.approvalId),
    index('ask_user_approvals_user_status_idx').on(table.userId, table.status),
  ]
);

export type AskUserApproval = typeof askUserApprovals.$inferSelect;
export type NewAskUserApproval = typeof askUserApprovals.$inferInsert;
