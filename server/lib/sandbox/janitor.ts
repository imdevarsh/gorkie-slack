import { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '~/config';
import {
  claimExpired,
  clearDestroyed,
  listExpired,
  updateStatus,
} from '~/db/queries/sandbox';
import { env } from '~/env';
import logger from '~/lib/logger';
import { toLogError } from '~/utils/error';

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function cleanup(): Promise<void> {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    const cutoff = new Date(Date.now() - config.autoDeleteAfterMs);
    const candidates = await listExpired(cutoff);

    for (const session of candidates) {
      const claimed = await claimExpired(session.threadId);
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
            ctxId: session.threadId,
            sandboxId: session.sandboxId,
            cutoff,
          },
          '[sandbox-janitor] Deleted expired sandbox'
        );
      } catch (error) {
        await updateStatus(session.threadId, 'paused');
        logger.warn(
          {
            ...toLogError(error),
            ctxId: session.threadId,
            sandboxId: session.sandboxId,
          },
          '[sandbox-janitor] Failed to delete expired sandbox'
        );
      }
    }
  } finally {
    isRunning = false;
  }
}

export function startSandboxJanitor(): void {
  if (timer) {
    return;
  }

  timer = setInterval(() => {
    cleanup().catch((error) => {
      logger.error(
        { ...toLogError(error) },
        '[sandbox-janitor] Unexpected error while running sweep'
      );
    });
  }, config.janitorIntervalMs);
  timer.unref();

  logger.info('[sandbox-janitor] Started');
}
