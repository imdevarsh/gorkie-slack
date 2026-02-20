import { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '~/config';
import {
  claimPausedForAutoDelete,
  clearDestroyed,
  listPausedForAutoDelete,
  updateStatus,
} from '~/db/queries/sandbox';
import { env } from '~/env';
import logger from '~/lib/logger';

let janitorTimer: ReturnType<typeof setInterval> | null = null;
let isSweepRunning = false;

async function runSweep(): Promise<void> {
  if (isSweepRunning) {
    return;
  }

  isSweepRunning = true;

  try {
    const cutoff = new Date(Date.now() - config.autoDeleteAfterMs);
    const candidates = await listPausedForAutoDelete(cutoff);

    for (const session of candidates) {
      const claimed = await claimPausedForAutoDelete(session.threadId);
      if (!claimed) {
        continue;
      }

      try {
        await Sandbox.kill(session.sandboxId, {
          apiKey: env.E2B_API_KEY,
        });
        await clearDestroyed(session.threadId);
        logger.info(
          {
            threadId: session.threadId,
            sandboxId: session.sandboxId,
            cutoff,
          },
          '[sandbox-janitor] Auto-deleted idle sandbox'
        );
      } catch (error) {
        await updateStatus(session.threadId, 'paused');
        logger.warn(
          {
            error,
            threadId: session.threadId,
            sandboxId: session.sandboxId,
          },
          '[sandbox-janitor] Failed to auto-delete idle sandbox'
        );
      }
    }
  } finally {
    isSweepRunning = false;
  }
}

export function startSandboxJanitor(): void {
  if (janitorTimer) {
    return;
  }

  janitorTimer = setInterval(() => {
    runSweep().catch((error) => {
      logger.error(
        { error },
        '[sandbox-janitor] Unexpected error while running sweep'
      );
    });
  }, config.janitorIntervalMs);
  janitorTimer.unref();

  logger.info(
    {
      janitorIntervalMs: config.janitorIntervalMs,
      autoDeleteAfterMs: config.autoDeleteAfterMs,
    },
    '[sandbox-janitor] Started'
  );
}
