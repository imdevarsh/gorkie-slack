import { sandbox as config } from '@/config';
import logger from '@/lib/logger';
import { agentFailed } from '@/lib/sandbox/agent-error';
import type { PiRpcClient } from '@/lib/sandbox/rpc/client';
import type { AgentSessionEvent } from '@/types/sandbox/rpc';

const MODEL_ATTEMPT_TIMEOUT_MS = 90_000;

export async function runInference({
  client,
  prompt,
  timeoutPromise,
  ctxId,
  onModelSwitch,
}: {
  client: PiRpcClient;
  prompt: string;
  timeoutPromise: Promise<never>;
  ctxId: string;
  onModelSwitch: (attempt: number, total: number) => void;
}): Promise<void> {
  await client.setAutoRetry(false);

  for (let i = 0; i < config.modelChain.length; i++) {
    if (i > 0) {
      const next = config.modelChain[i];
      if (!next) {
        break;
      }
      logger.warn(
        { ctxId, provider: next.provider, modelId: next.modelId, attempt: i },
        '[sandbox] Model failed, switching to fallback'
      );
      onModelSwitch(i, config.modelChain.length);
      await client.setModel(next.provider, next.modelId);
    }

    const events: AgentSessionEvent[] = [];
    const off = client.onEvent((e) => events.push(e));
    let failed = false;

    let attemptTimer: ReturnType<typeof setTimeout> | undefined;
    const attemptTimeout = new Promise<never>((_, reject) => {
      attemptTimer = setTimeout(
        () => reject(new Error('[sandbox] Model attempt timed out')),
        MODEL_ATTEMPT_TIMEOUT_MS
      );
    });

    try {
      const idle = client.waitForIdle();
      await client.prompt(prompt);
      await Promise.race([idle, timeoutPromise, attemptTimeout]);
      failed = agentFailed(events);
    } catch (error) {
      const isAttemptTimeout =
        error instanceof Error &&
        error.message.includes('Model attempt timed out');
      if (!isAttemptTimeout) {
        throw error;
      }
      logger.warn(
        { ctxId, attempt: i },
        '[sandbox] Model attempt timed out, trying next'
      );
      failed = true;
    } finally {
      clearTimeout(attemptTimer);
      off();
    }

    if (!failed) {
      break;
    }
  }
}
