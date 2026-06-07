import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const sandboxSessions = pgTable(
  'sandbox_sessions',
  {
    threadId: text('thread_id').primaryKey(),
    sandboxId: text('sandbox_id').notNull(),
    sessionId: text('session_id').notNull(),
    status: text('status').notNull().default('creating'),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    resumedAt: timestamp('resumed_at', { withTimezone: true }),
    destroyedAt: timestamp('destroyed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('sandbox_sessions_status_idx').on(table.status),
    index('sandbox_sessions_paused_idx').on(table.pausedAt),
    index('sandbox_sessions_updated_idx').on(table.updatedAt),
  ]
);

export const sandboxTokens = pgTable(
  'sandbox_tokens',
  {
    token: text('token').primaryKey(),
    sandboxId: text('sandbox_id').notNull(),
    allowedIp: text('allowed_ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('sandbox_tokens_sandbox_idx').on(table.sandboxId),
    index('sandbox_tokens_expires_idx').on(table.expiresAt),
  ]
);

export type SandboxSession = typeof sandboxSessions.$inferSelect;
export type NewSandboxSession = typeof sandboxSessions.$inferInsert;
export type SandboxToken = typeof sandboxTokens.$inferSelect;
export type NewSandboxToken = typeof sandboxTokens.$inferInsert;
