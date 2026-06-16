import { bot } from '@/bot';
import logger from '@/lib/logger';

const shutdownState = globalThis as typeof globalThis & {
  gorkieShutdownRegistered?: boolean;
  gorkieShuttingDown?: boolean;
};

async function shutdown(signal: string): Promise<void> {
  if (shutdownState.gorkieShuttingDown) {
    return;
  }
  shutdownState.gorkieShuttingDown = true;
  logger.info({ signal }, '[bot] shutting down');
  await bot.shutdown().catch((error: unknown) => {
    logger.error({ err: error }, '[bot] error during shutdown');
  });
  process.exit(0);
}

try {
  await bot.initialize();
  logger.info('[bot] gorkie is online (slack · socket mode)');
} catch (error) {
  logger.error({ err: error }, '[bot] failed to start');
  process.exit(1);
}

if (!shutdownState.gorkieShutdownRegistered) {
  shutdownState.gorkieShutdownRegistered = true;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      shutdown(signal).catch((error: unknown) => {
        logger.error({ err: error }, '[bot] shutdown failed');
        process.exit(1);
      });
    });
  }
}
