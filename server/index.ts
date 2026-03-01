import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { env } from '~/env';
import logger from '~/lib/logger';
import { startSandboxJanitor } from '~/lib/sandbox/janitor';
import { startScheduledTaskRunner } from '~/lib/tasks/runner';
import { createSlackApp } from '~/slack/app';

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});

sdk.start();

process.on('unhandledRejection', (reason) => {
  logger.error({ error: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
  sdk
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
  startSandboxJanitor();
  const { app, socketMode } = createSlackApp();
  startScheduledTaskRunner(app.client);

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
  await sdk.shutdown();
  process.exitCode = 1;
});
