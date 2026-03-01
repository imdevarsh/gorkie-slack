import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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

export type SandboxSession = typeof sandboxSessions.$inferSelect;
export type NewSandboxSession = typeof sandboxSessions.$inferInsert;

export const scheduledTasks = pgTable(
  'scheduled_tasks',
  {
    id: text('id').primaryKey(),
    creatorUserId: text('creator_user_id').notNull(),
    destinationType: text('destination_type').notNull(),
    destinationId: text('destination_id').notNull(),
    threadTs: text('thread_ts'),
    prompt: text('prompt').notNull(),
    cronExpression: text('cron_expression').notNull(),
    timezone: text('timezone').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
    runningAt: timestamp('running_at', { withTimezone: true }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastStatus: text('last_status'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('scheduled_tasks_due_idx').on(table.enabled, table.nextRunAt),
    index('scheduled_tasks_running_idx').on(table.runningAt),
    index('scheduled_tasks_creator_idx').on(table.creatorUserId),
  ]
);

export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type NewScheduledTask = typeof scheduledTasks.$inferInsert;
