import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { env } from '~/env';
import { initializeDatabase } from '~/db/init';
import logger from '~/lib/logger';
import { sandboxRuntimeManager } from '~/lib/runtime/sandbox-runtime-manager';
import { createSlackApp } from '~/slack/app';

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});

sdk.start();

async function main() {
  await initializeDatabase();
  const { app, socketMode } = createSlackApp();
  sandboxRuntimeManager.startCleanupLoop();

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
  sandboxRuntimeManager.stopCleanupLoop();
  await sdk.shutdown();
  process.exitCode = 1;
});
