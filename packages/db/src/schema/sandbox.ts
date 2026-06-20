import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const sandboxStatus = pgEnum('sandbox_status', [
  'creating',
  'active',
  'paused',
  'destroyed',
]);

export type SandboxStatus = (typeof sandboxStatus.enumValues)[number];

export const sandboxSessions = pgTable(
  'sandbox_sessions',
  {
    threadId: text('thread_id').primaryKey(),
    sandboxId: text('sandbox_id').notNull(),
    sessionId: text('session_id').notNull(),
    resumeState: text('resume_state'),
    // Pi transcript mirror for sandbox recreation.
    session: jsonb('session').$type<{ data: string; file: string }>(),
    status: sandboxStatus('status').notNull().default('creating'),
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

export type SandboxSession = typeof sandboxSessions.$inferSelect;
export type NewSandboxSession = typeof sandboxSessions.$inferInsert;
