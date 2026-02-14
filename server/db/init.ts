import { sql } from 'drizzle-orm';
import { db } from '~/db/client';
import logger from '~/lib/logger';

const LOG_PREFIX = '[db]';

export async function initializeDatabase(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS discord_sessions (
      thread_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      sandbox_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      preview_url TEXT NOT NULL,
      preview_token TEXT,
      status TEXT NOT NULL CHECK (
        status IN (
          'creating',
          'active',
          'pausing',
          'paused',
          'resuming',
          'destroying',
          'destroyed',
          'error'
        )
      ),
      last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      pause_requested_at TIMESTAMPTZ,
      paused_at TIMESTAMPTZ,
      resume_attempted_at TIMESTAMPTZ,
      resumed_at TIMESTAMPTZ,
      destroyed_at TIMESTAMPTZ,
      last_health_ok_at TIMESTAMPTZ,
      last_error TEXT,
      resume_fail_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS discord_sessions_status_last_activity_idx
    ON discord_sessions (status, last_activity)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS discord_sessions_status_updated_at_idx
    ON discord_sessions (status, updated_at)
  `);
}

if (import.meta.main) {
  initializeDatabase()
    .then(() => {
      logger.info(`${LOG_PREFIX} Schema is ready`);
    })
    .catch((error: unknown) => {
      logger.error({ error }, `${LOG_PREFIX} Failed to initialize schema`);
      process.exitCode = 1;
    });
}
