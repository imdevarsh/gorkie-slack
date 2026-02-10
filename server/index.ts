import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { env } from '~/env';
import { cleanupSnapshots } from '~/lib/ai/tools/sandbox/bash/snapshot';
import logger from '~/lib/logger';
import { createSlackApp } from '~/slack/app';

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});

sdk.start();

async function main() {
  const { app, socketMode } = createSlackApp();

  if (socketMode) {
    await app.start();
    logger.info('Slack Bolt app connected via Socket Mode');
    return;
  }

  await app.start(env.PORT);
  logger.info({ port: env.PORT }, 'Slack Bolt app listening for events');

  setInterval(
    () => {
      cleanupSnapshots().catch((error: unknown) => {
        logger.warn({ error }, 'Snapshot cleanup failed');
      });
    },
    30 * 60 * 1000
  );
}

main().catch(async (error) => {
  logger.error({ error }, 'Failed to start Slack Bolt app');
  await sdk.shutdown();
  process.exitCode = 1;
});
