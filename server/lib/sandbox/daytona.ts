import { Daytona, type Sandbox } from '@daytonaio/sdk';
import { sandbox as config } from '~/config';
import logger from '~/lib/logger';

export const daytona = new Daytona({
  apiKey: config.daytona.apiKey,
  ...(config.daytona.apiUrl ? { apiUrl: config.daytona.apiUrl } : {}),
  ...(config.daytona.target ? { target: config.daytona.target } : {}),
});

export class SandboxNotFoundError extends Error {}

export function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  if (message.includes('not found') || message.includes('404')) {
    return true;
  }
  const { status, statusCode } = error as {
    status?: number;
    statusCode?: number;
  };
  return status === 404 || statusCode === 404;
}

export async function bringOnline(
  sandbox: Sandbox,
  threadId: string
): Promise<void> {
  const { state } = sandbox;

  if (state === 'started') {
    return;
  }

  if (state === 'destroyed' || state === 'build_failed') {
    throw new SandboxNotFoundError(
      `Sandbox ${sandbox.id} is in terminal state: ${state}`
    );
  }

  if (state === 'error') {
    if (!sandbox.recoverable) {
      throw new SandboxNotFoundError(
        `Sandbox ${sandbox.id} is in unrecoverable error: ${sandbox.errorReason ?? 'unknown'}`
      );
    }
    logger.warn(
      { sandboxId: sandbox.id, errorReason: sandbox.errorReason, threadId },
      '[sandbox] Recovering from error state'
    );
    await sandbox.recover(config.daytona.startTimeoutSeconds);
    return;
  }

  logger.info(
    { sandboxId: sandbox.id, state, threadId },
    '[sandbox] Starting sandbox'
  );
  await sandbox.start(config.daytona.startTimeoutSeconds);
}
