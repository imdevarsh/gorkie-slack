import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { runtimeSessionStatuses } from '~/lib/runtime/types';

export const discordSessions = pgTable(
  'discord_sessions',
  {
    threadId: text('thread_id').primaryKey(),
    channelId: text('channel_id').notNull(),
    workspaceId: text('guild_id').notNull(),
    sandboxId: text('sandbox_id').notNull(),
    sessionId: text('session_id').notNull(),
    previewUrl: text('preview_url').notNull(),
    previewToken: text('preview_token'),
    status: text('status', { enum: runtimeSessionStatuses }).notNull(),
    lastActivity: timestamp('last_activity', { withTimezone: true })
      .defaultNow()
      .notNull(),
    pauseRequestedAt: timestamp('pause_requested_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    resumeAttemptedAt: timestamp('resume_attempted_at', { withTimezone: true }),
    resumedAt: timestamp('resumed_at', { withTimezone: true }),
    destroyedAt: timestamp('destroyed_at', { withTimezone: true }),
    lastHealthOkAt: timestamp('last_health_ok_at', { withTimezone: true }),
    lastError: text('last_error'),
    resumeFailCount: integer('resume_fail_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('discord_sessions_status_last_activity_idx').on(
      table.status,
      table.lastActivity
    ),
    index('discord_sessions_status_updated_at_idx').on(
      table.status,
      table.updatedAt
    ),
  ]
);
