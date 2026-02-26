import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { serve } from 'bun';
import { bot, initializeBot, shutdownBot } from '~/chat/bot';
import { env } from '~/env';
import logger from '~/lib/logger';

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});

sdk.start();

process.on('unhandledRejection', (reason) => {
  logger.error({ error: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
});

async function main() {
  await initializeBot();

  const server = serve({
    port: env.PORT,
    fetch(request: Request) {
      const url = new URL(request.url);

      if (url.pathname === '/api/webhooks/slack') {
        return bot.webhooks.slack(request);
      }

      if (url.pathname === '/health') {
        return new Response('ok');
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  logger.info({ port: server.port }, 'Chat SDK bot listening for webhooks');

  const shutdown = async () => {
    logger.info('Shutting down Chat SDK bot');
    server.stop(true);
    await shutdownBot();
    await sdk.shutdown();
  };

  process.on('SIGINT', () => {
    shutdown().catch((error: unknown) => {
      logger.error({ error }, 'Failed to shut down on SIGINT');
    });
  });

  process.on('SIGTERM', () => {
    shutdown().catch((error: unknown) => {
      logger.error({ error }, 'Failed to shut down on SIGTERM');
    });
  });
}

main().catch(async (error) => {
  logger.error({ error }, 'Failed to start Chat SDK bot');
  await shutdownBot().catch(() => null);
  await sdk.shutdown().catch(() => null);
  process.exitCode = 1;
});
