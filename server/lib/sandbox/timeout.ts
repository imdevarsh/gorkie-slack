import type { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '~/config';
import logger from '~/lib/logger';
import { toLogError } from '~/utils/error';

function resolveEndAtMs(endAt: unknown): number {
  if (endAt instanceof Date) {
    return endAt.getTime();
  }

  if (typeof endAt === 'string' || typeof endAt === 'number') {
    const parsed = new Date(endAt).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export async function extendSandboxTimeout(
  sandbox: Sandbox,
  minimumTimeoutMs?: number
): Promise<void> {
  const requiredRemainingMs = Math.max(
    config.rpc.commandTimeoutMs,
    minimumTimeoutMs ?? 0
  );

  try {
    const info = await sandbox.getInfo();
    const endAtMs = resolveEndAtMs((info as { endAt?: unknown }).endAt);
    const remainingMs = Number.isFinite(endAtMs) ? endAtMs - Date.now() : 0;

    if (remainingMs >= requiredRemainingMs) {
      return;
    }

    await sandbox.setTimeout(config.timeoutMs);
  } catch (error) {
    logger.warn(
      { ...toLogError(error), requiredRemainingMs },
      '[sandbox] Failed to extend timeout'
    );
  }
}
