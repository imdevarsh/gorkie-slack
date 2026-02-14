import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const sandboxSessions = pgTable(
  'sandbox_sessions',
  {
    threadId: text('thread_id').primaryKey(),
    channelId: text('channel_id').notNull(),
    sandboxId: text('sandbox_id').notNull(),
    sessionId: text('session_id').notNull(),
    previewUrl: text('preview_url'),
    previewToken: text('preview_token'),
    status: text('status').notNull().default('creating'),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    resumedAt: timestamp('resumed_at', { withTimezone: true }),
    destroyedAt: timestamp('destroyed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusIdx: index('sandbox_sessions_status_idx').on(table.status),
    pausedIdx: index('sandbox_sessions_paused_idx').on(table.pausedAt),
    updatedIdx: index('sandbox_sessions_updated_idx').on(table.updatedAt),
  })
);

export type SandboxSession = typeof sandboxSessions.$inferSelect;
export type NewSandboxSession = typeof sandboxSessions.$inferInsert;
