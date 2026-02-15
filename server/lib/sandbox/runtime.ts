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

function isMissingTemplateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('template') &&
    (message.includes('not found') ||
      message.includes('does not exist') ||
      message.includes('unknown template') ||
      message.includes('404'))
  );
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        typeof error.cause === 'object' && error.cause !== null
          ? error.cause
          : (error.cause ?? null),
    };
  }

  if (typeof error === 'object' && error !== null) {
    return error as Record<string, unknown>;
  }

  return { error: String(error) };
}

async function ensureRuntimeDirectories(sandbox: Sandbox): Promise<void> {
  await Promise.all([
    sandbox.files.makeDir(config.paths.workdir),
    sandbox.files.makeDir(config.paths.attachments),
    sandbox.files.makeDir(config.paths.output),
    sandbox.files.makeDir(config.paths.turns),
  ]);
}

async function createSandbox(
  context: SlackMessageContext,
  threadId: string
): Promise<ResolvedSandbox> {
  const template = getTemplate();
  const createOpts = {
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

  let sandbox: Sandbox;
  try {
    sandbox = await Sandbox.betaCreate(template, createOpts);
  } catch (error) {
    if (!isMissingTemplateError(error)) {
      throw error;
    }

    await buildTemplateIfMissing(template);
    sandbox = await Sandbox.betaCreate(template, createOpts);
  }

  await ensureRuntimeDirectories(sandbox);
  await sandbox.setTimeout(config.timeoutMs);

  await upsert({
    threadId,
    channelId: getChannelId(context),
    sandboxId: sandbox.sandboxId,
    status: 'active',
    resumedAt: new Date(),
    destroyedAt: null,
    pausedAt: null,
    lastError: null,
  });

  logger.info(
    {
      threadId,
      sandboxId: sandbox.sandboxId,
      template,
      timeoutMs: config.timeoutMs,
    },
    '[sandbox] Created E2B sandbox'
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

  await updateStatus(threadId, 'resuming', null);

  try {
    const sandbox = await Sandbox.connect(existing.sandboxId, {
      apiKey: env.E2B_API_KEY,
      timeoutMs: config.timeoutMs,
    });

    await sandbox.setTimeout(config.timeoutMs);
    await ensureRuntimeDirectories(sandbox);
    await updateStatus(threadId, 'active', null);
    await markActivity(threadId);

    logger.info(
      { threadId, sandboxId: existing.sandboxId },
      '[sandbox] Reused E2B sandbox'
    );

    return {
      sandbox,
      sandboxId: existing.sandboxId,
      threadId,
    };
  } catch (error) {
    logger.warn(
      { error: errorDetails(error), threadId, sandboxId: existing.sandboxId },
      '[sandbox] Failed to reconnect E2B sandbox'
    );

    if (isMissingSandboxError(error)) {
      await clearDestroyed(threadId);
      return createSandbox(context, threadId);
    }

    await updateStatus(
      threadId,
      'error',
      error instanceof Error ? error.message : String(error)
    );
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
    await updateStatus(threadId, 'paused', null);
    logger.info(
      { threadId, sandboxId: existing.sandboxId },
      '[sandbox] Paused E2B sandbox'
    );
  } catch (error) {
    logger.warn(
      { error: errorDetails(error), threadId, sandboxId: existing.sandboxId },
      '[sandbox] Failed to pause E2B sandbox'
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
      { threadId, sandboxId: existing.sandboxId },
      '[sandbox] Destroyed E2B sandbox'
    );
  } catch (error) {
    logger.warn(
      { error: errorDetails(error), threadId, sandboxId: existing.sandboxId },
      '[sandbox] Failed to kill E2B sandbox'
    );
  } finally {
    await clearDestroyed(threadId);
  }
}
