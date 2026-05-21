import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";
import type { Logger } from "@repo/logging/log";
import { env } from "@/env";

interface StartTelemetryOptions {
  logger?: Logger;
}

interface Telemetry {
  shutdown: () => Promise<void>;
}

function hasLangfuseCredentials(): boolean {
  return Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY);
}

export function startTelemetry({
  logger,
}: StartTelemetryOptions = {}): Telemetry {
  if (!hasLangfuseCredentials()) {
    logger?.debug("Telemetry disabled; missing Langfuse credentials");
    return {
      shutdown: async () => undefined,
    };
  }

  const sdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor()],
  });

  sdk.start();
  logger?.debug("Telemetry started");

  return {
    shutdown: () => sdk.shutdown(),
  };
}
