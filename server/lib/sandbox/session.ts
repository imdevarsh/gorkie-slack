import { Daytona, type Sandbox } from '@daytonaio/sdk';
import { sandbox as config } from '~/config';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import * as redis from './queries';

const daytona = new Daytona({
  apiKey: config.daytona.apiKey,
  ...(config.daytona.apiUrl ? { apiUrl: config.daytona.apiUrl } : {}),
  ...(config.daytona.target ? { target: config.daytona.target } : {}),
});

async function reconnectById(ctxId: string): Promise<Sandbox | null> {
  const { sandboxId } = await redis.getState(ctxId);
  if (!sandboxId) {
    return null;
  }

  const sandbox = await daytona.get(sandboxId).catch(() => null);
  if (!sandbox) {
    await redis.clearSandbox(ctxId);
    return null;
  }

  if (sandbox.state !== 'started') {
    const started = await sandbox.start().catch((error: unknown) => {
      logger.warn(
        { error, sandboxId, ctxId },
        '[sandbox] Failed to start existing Daytona sandbox'
      );
      return null;
    });

    if (!started) {
      await redis.clearSandbox(ctxId);
      return null;
    }
  }

  return sandbox;
}

async function createSandbox(
  context: SlackMessageContext,
  ctxId: string
): Promise<Sandbox> {
  await setStatus(context, {
    status: 'is setting up the sandbox',
    loading: true,
  });

  const common = {
    autoStopInterval: config.autoStopMinutes,
    autoArchiveInterval: config.autoArchiveMinutes,
    autoDeleteInterval: config.autoDeleteMinutes,
    language: 'typescript',
  } as const;

  const sandbox = config.daytona.snapshot
    ? await daytona.create({
        ...common,
        snapshot: config.daytona.snapshot,
      })
    : await daytona.create({
        ...common,
      });

  logger.info(
    { ctxId, sandboxId: sandbox.id },
    '[sandbox] Created Daytona sandbox'
  );

  return sandbox;
}

export async function getSandbox(
  context: SlackMessageContext
): Promise<Sandbox> {
  const ctxId = getContextId(context);
  const live = await reconnectById(ctxId);

  if (live) {
    await redis.setSandboxId(ctxId, live.id);
    return live;
  }

  const created = await createSandbox(context, ctxId);
  await redis.setSandboxId(ctxId, created.id);
  return created;
}

export async function reconnectSandbox(
  context: SlackMessageContext
): Promise<Sandbox | null> {
  const ctxId = getContextId(context);
  return await reconnectById(ctxId);
}

export async function stopSandbox(context: SlackMessageContext): Promise<void> {
  const ctxId = getContextId(context);
  const live = await reconnectById(ctxId);

  if (!live) {
    return;
  }

  await redis.setSandboxId(ctxId, live.id);
}
