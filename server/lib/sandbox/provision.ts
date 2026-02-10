import { Sandbox } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { installUtils, makeFolders } from './bootstrap';
import { restoreSandbox } from './connect';

export async function provisionSandbox(
  ctxId: string,
  context?: SlackMessageContext
): Promise<Sandbox> {
  if (context) {
    await setStatus(context, {
      status: 'is restoring the sandbox',
      loading: true,
    });
  }

  const restored = await restoreSandbox(ctxId);
  if (restored) {
    await installUtils(restored);
    return restored;
  }

  if (context) {
    await setStatus(context, {
      status: 'is setting up the sandbox',
      loading: true,
    });
  }

  const instance = await Sandbox.create({
    runtime: config.runtime,
    timeout: config.timeoutMs,
  });

  await makeFolders(instance);
  await installUtils(instance);

  logger.info({ sandboxId: instance.sandboxId, ctxId }, 'Created sandbox');
  return instance;
}
