import { bot } from '@/bot';
import { slack } from '@/lib/chat';
import logger from '@/lib/logger';
import { shutdownLangfuse } from '@/lib/observability/langfuse';

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, '[bot] shutting down');
  await bot.shutdown().catch((error: unknown) => {
    logger.error({ err: error }, '[bot] error during shutdown');
  });
  await shutdownLangfuse();
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
    `[bot] gorkie ${botProfile?.user?.profile?.display_name || botProfile?.user?.profile?.real_name || botProfile?.user?.name || 'gorkie'} (${slack.botUserId ?? 'unknown id'}) is online`
  );
} catch (error) {
  logger.error({ err: error }, '[bot] failed to start');
  process.exit(1);
}

process.once('SIGINT', () => {
  shutdown('SIGINT').catch((error: unknown) => {
    logger.error({ err: error }, '[bot] shutdown failed');
    process.exit(1);
  });
});

process.once('SIGTERM', () => {
  shutdown('SIGTERM').catch((error: unknown) => {
    logger.error({ err: error }, '[bot] shutdown failed');
    process.exit(1);
  });
});
