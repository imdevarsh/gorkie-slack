import { env } from '@/env';
import { startTelemetry } from '@/lib/ai/telemetry';
import logger from '@/lib/logger';
import { startSandboxCleanup } from '@/lib/sandbox/janitor';
import { startTaskRunner } from '@/lib/tasks/runner';
import { createSlackApp } from '@/slack/app';

const telemetry = startTelemetry({ logger });

process.on('unhandledRejection', (reason) => {
  logger.error({ error: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
  telemetry
    .shutdown()
    .catch((shutdownError: unknown) => {
      logger.error(
        { error: shutdownError },
        'Failed to shutdown telemetry after uncaught exception'
      );
    })
    .finally(() => {
      process.exit(1);
    });
});

async function main() {
  startSandboxCleanup();
  const { app, socketMode } = createSlackApp();
  startTaskRunner(app.client);

  if (socketMode) {
    await app.start();
    logger.info('Slack Bolt app connected via Socket Mode');
    return;
  }

  await app.start(env.PORT);
  logger.info({ port: env.PORT }, 'Slack Bolt app listening for events');
}

main().catch(async (error) => {
  logger.error({ error }, 'Failed to start Slack Bolt app');
  await telemetry.shutdown();
  process.exitCode = 1;
});
