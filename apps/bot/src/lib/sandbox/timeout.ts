import type { Sandbox } from '@e2b/code-interpreter';
import { toLogError } from '@repo/utils/error';
import { sandbox as config } from '@/config';
import logger from '@/lib/logger';

export async function extendSandboxTimeout(
  sandbox: Sandbox,
  minimumTimeoutMs?: number
): Promise<void> {
  const requiredRemainingMs = Math.max(
    config.rpc.command,
    minimumTimeoutMs ?? 0
  );

  try {
    const info = await sandbox.getInfo();
    const endAt = (info as { endAt?: unknown }).endAt;

    let endAtMs = 0;
    if (endAt instanceof Date) {
      endAtMs = endAt.getTime();
    } else if (typeof endAt === 'string' || typeof endAt === 'number') {
      const parsed = new Date(endAt).getTime();
      endAtMs = Number.isFinite(parsed) ? parsed : 0;
    }

    const remainingMs = Number.isFinite(endAtMs) ? endAtMs - Date.now() : 0;

    if (remainingMs >= requiredRemainingMs) {
      return;
    }

    await sandbox.setTimeout(config.timeout);
  } catch (error) {
    logger.warn(
      { ...toLogError(error), requiredRemainingMs },
      '[sandbox] Failed to extend timeout'
    );
  }
}
