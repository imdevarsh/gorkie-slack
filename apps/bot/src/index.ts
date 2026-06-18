import { bot } from '@/bot';
import { stopAllTurns } from '@/lib/agent';
import { slack } from '@/lib/chat';
import logger from '@/lib/logger';
import { shutdownLangfuse } from '@/lib/observability/langfuse';

declare global {
  var gorkieRuntime:
    | {
        cleanup?: (reason: string) => Promise<void>;
        shutdownHandlers?: {
          SIGINT?: () => void;
          SIGTERM?: () => void;
        };
        shuttingDown?: boolean;
      }
    | undefined;
}

globalThis.gorkieRuntime ??= {};

await globalThis.gorkieRuntime.cleanup?.('reload').catch((error: unknown) => {
  logger.error({ err: error }, '[bot] reload cleanup failed');
});

let cleanedUp = false;

async function cleanup(reason: string): Promise<void> {
  if (cleanedUp) {
    return;
  }
  cleanedUp = true;
  stopAllTurns();
  if (reason === 'reload') {
    logger.info('[bot] reloading');
  } else {
    logger.info({ signal: reason }, '[bot] shutting down');
  }
  await bot.shutdown().catch((error: unknown) => {
    logger.error({ err: error }, '[bot] error during shutdown');
  });
  await shutdownLangfuse();
}

globalThis.gorkieRuntime.cleanup = cleanup;
globalThis.gorkieRuntime.shuttingDown = false;

async function shutdown(signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
  if (globalThis.gorkieRuntime?.shuttingDown) {
    return;
  }
  globalThis.gorkieRuntime ??= {};
  globalThis.gorkieRuntime.shuttingDown = true;
  await cleanup(signal);
  process.exit(0);
}

try {
  await bot.initialize();
  const botProfile = slack.botUserId
    ? await slack.webClient.users
        .info({ user: slack.botUserId })
        .catch(() => null)
    : null;
  logger.info(
    `[bot] ${botProfile?.user?.profile?.display_name || botProfile?.user?.profile?.real_name || botProfile?.user?.name || 'gorkie'} (${slack.botUserId ?? 'unknown id'}) is online`
  );
} catch (error) {
  logger.error({ err: error }, '[bot] failed to start');
  process.exit(1);
}

registerShutdown('SIGINT');
registerShutdown('SIGTERM');

function registerShutdown(signal: 'SIGINT' | 'SIGTERM'): void {
  const previous = globalThis.gorkieRuntime?.shutdownHandlers?.[signal];
  if (previous) {
    process.removeListener(signal, previous);
  }
  const handler = () => {
    shutdown(signal).catch((error: unknown) => {
      logger.error({ err: error }, '[bot] shutdown failed');
      process.exit(1);
    });
  };
  globalThis.gorkieRuntime ??= {};
  globalThis.gorkieRuntime.shutdownHandlers ??= {};
  globalThis.gorkieRuntime.shutdownHandlers[signal] = handler;
  process.once(signal, handler);
}
