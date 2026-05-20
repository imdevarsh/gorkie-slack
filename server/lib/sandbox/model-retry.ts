import { sandbox as config } from '~/config';
import logger from '~/lib/logger';
import type { PiRpcClient } from '~/lib/sandbox/rpc/client';

export async function runWithModelRetry({
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
  let modelFailed = false;
  let modelIdx = 0;

  const offModelFailure = client.onEvent((event) => {
    if (event.type === 'auto_retry_end' && !event.success) {
      modelFailed = true;
    }
  });

  try {
    const idle = client.waitForIdle();
    await client.prompt(prompt);
    await Promise.race([idle, timeoutPromise]);

    while (modelFailed && modelIdx < config.modelChain.length - 1) {
      modelFailed = false;
      modelIdx++;
      const next = config.modelChain[modelIdx];
      if (!next) {
        break;
      }

      logger.warn(
        {
          ctxId,
          provider: next.provider,
          modelId: next.modelId,
          attempt: modelIdx,
        },
        '[sandbox] Model exhausted retries, switching to fallback'
      );
      onModelSwitch(modelIdx, config.modelChain.length - 1);

      await client.setModel(next.provider, next.modelId);
      const retryIdle = client.waitForIdle();
      await client.followUp(
        'The previous request failed due to an API error. Please retry.'
      );
      await Promise.race([retryIdle, timeoutPromise]);
    }
  } finally {
    offModelFailure();
  }
}
