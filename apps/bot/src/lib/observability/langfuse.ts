import { LegacyOpenTelemetry } from '@ai-sdk/otel';
import { LangfuseSpanProcessor, type ShouldExportSpan } from '@langfuse/otel';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { registerTelemetry } from 'ai';
import { env } from '@/env';
import logger from '@/lib/logger';

const enabled = Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY);

const shouldExportSpan: ShouldExportSpan = () => true;

const tracerProvider = enabled
  ? new NodeTracerProvider({
      spanProcessors: [
        new LangfuseSpanProcessor({
          baseUrl: env.LANGFUSE_BASEURL,
          environment: env.NODE_ENV,
          publicKey: env.LANGFUSE_PUBLIC_KEY,
          secretKey: env.LANGFUSE_SECRET_KEY,
          shouldExportSpan,
        }),
      ],
    })
  : undefined;

if (tracerProvider) {
  tracerProvider.register();
  registerTelemetry(new LegacyOpenTelemetry());
  logger.info('[langfuse] tracing enabled');
}

export async function shutdownLangfuse(): Promise<void> {
  await tracerProvider?.shutdown().catch((error: unknown) => {
    logger.warn({ err: error }, '[langfuse] shutdown failed');
  });
}
