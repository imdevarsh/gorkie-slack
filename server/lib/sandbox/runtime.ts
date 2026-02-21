import { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '~/config';
import {
  clearDestroyed,
  getByThread,
  markActivity,
  updateStatus,
  upsert,
} from '~/db/queries/sandbox';
import { env } from '~/env';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { toLogError } from '~/utils/error';
import { buildTemplateIfMissing, getTemplate } from './template.build';

export interface ResolvedSandbox {
  sandbox: Sandbox;
  sandboxId: string;
  threadId: string;
}

function getChannelId(context: SlackMessageContext): string {
  const channelId = (context.event as { channel?: string }).channel;
  if (!(typeof channelId === 'string' && channelId.length > 0)) {
    throw new Error('Missing Slack channel ID for sandbox session');
  }

  return channelId;
}

function isMissingSandboxError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('not found') ||
    message.includes('404') ||
    message.includes('does not exist')
  );
}

async function createSandbox(
  context: SlackMessageContext,
  threadId: string
): Promise<ResolvedSandbox> {
  const template = getTemplate();
  const options = {
    apiKey: env.E2B_API_KEY,
    timeoutMs: config.timeoutMs,
    autoPause: true,
    allowInternetAccess: true,
    metadata: {
      threadId,
      channelId: getChannelId(context),
      app: 'gorkie-slack',
    },
  };

  await buildTemplateIfMissing(template);
  const sandbox = await Sandbox.betaCreate(template, options);

  await sandbox.setTimeout(config.timeoutMs);

  await upsert({
    threadId,
    channelId: getChannelId(context),
    sandboxId: sandbox.sandboxId,
    status: 'active',
    resumedAt: new Date(),
    destroyedAt: null,
    pausedAt: null,
  });

  logger.info(
    {
      ctxId: threadId,
      sandboxId: sandbox.sandboxId,
      template,
      timeoutMs: config.timeoutMs,
    },
    '[sandbox] Created sandbox'
  );

  return {
    sandbox,
    sandboxId: sandbox.sandboxId,
    threadId,
  };
}

export async function ensureSandbox(
  context: SlackMessageContext
): Promise<ResolvedSandbox> {
  const threadId = getContextId(context);
  const existing = await getByThread(threadId);

  if (!existing || existing.status === 'destroyed') {
    return createSandbox(context, threadId);
  }

  await updateStatus(threadId, 'resuming');

  try {
    const sandbox = await Sandbox.connect(existing.sandboxId, {
      apiKey: env.E2B_API_KEY,
      timeoutMs: config.timeoutMs,
    });

    await sandbox.setTimeout(config.timeoutMs);
    await updateStatus(threadId, 'active');
    await markActivity(threadId);

    logger.info(
      { ctxId: threadId, sandboxId: existing.sandboxId },
      '[sandbox] Reused sandbox'
    );

    return {
      sandbox,
      sandboxId: existing.sandboxId,
      threadId,
    };
  } catch (error) {
    logger.warn(
      {
        ...toLogError(error),
        ctxId: threadId,
        sandboxId: existing.sandboxId,
      },
      '[sandbox] Failed to reconnect sandbox'
    );

    if (isMissingSandboxError(error)) {
      await clearDestroyed(threadId);
      return createSandbox(context, threadId);
    }

    await updateStatus(threadId, 'error');
    throw error;
  }
}

export async function pauseSandbox(
  context: SlackMessageContext
): Promise<void> {
  const threadId = getContextId(context);
  const existing = await getByThread(threadId);

  if (!existing) {
    return;
  }

  try {
    await Sandbox.betaPause(existing.sandboxId, {
      apiKey: env.E2B_API_KEY,
    });
    await updateStatus(threadId, 'paused');
    logger.info(
      { ctxId: threadId, sandboxId: existing.sandboxId },
      '[sandbox] Paused sandbox'
    );
  } catch (error) {
    logger.warn(
      {
        ...toLogError(error),
        ctxId: threadId,
        sandboxId: existing.sandboxId,
      },
      '[sandbox] Failed to pause sandbox'
    );
  }
}

export async function destroySandbox(
  context: SlackMessageContext
): Promise<void> {
  const threadId = getContextId(context);
  const existing = await getByThread(threadId);

  if (!existing) {
    return;
  }

  try {
    await Sandbox.kill(existing.sandboxId, {
      apiKey: env.E2B_API_KEY,
    });
    logger.info(
      { ctxId: threadId, sandboxId: existing.sandboxId },
      '[sandbox] Destroyed sandbox'
    );
  } catch (error) {
    logger.warn(
      {
        ...toLogError(error),
        ctxId: threadId,
        sandboxId: existing.sandboxId,
      },
      '[sandbox] Failed to kill sandbox'
    );
  } finally {
    await clearDestroyed(threadId);
  }
}
