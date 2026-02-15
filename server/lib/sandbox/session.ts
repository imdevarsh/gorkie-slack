import { Daytona, type Sandbox } from '@daytonaio/sdk';
import type { SandboxAgent, Session } from 'sandbox-agent';
import { sandbox as config } from '~/config';
import {
  clearDestroyed,
  getByThread,
  markActivity,
  updateRuntime,
  updateStatus,
  upsert,
} from '~/db/queries/sandbox';
import { systemPrompt } from '~/lib/ai/prompts';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { buildConfig, CONFIG_PATH } from './config';
import { boot, createSession, ensureSession } from './runtime';
import { createSnapshot, SANDBOX_SNAPSHOT } from './snapshot';

const daytona = new Daytona({
  apiKey: config.daytona.apiKey,
  ...(config.daytona.apiUrl ? { apiUrl: config.daytona.apiUrl } : {}),
  ...(config.daytona.target ? { target: config.daytona.target } : {}),
});

export interface ResolvedSandboxSession {
  sdk: SandboxAgent;
  sandbox: Sandbox;
  session: Session;
  sessionId: string;
  baseUrl: string;
}

class SandboxNotFoundError extends Error {}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (message.includes('not found') || message.includes('404')) {
    return true;
  }

  const status = (error as { status?: number; statusCode?: number }).status;
  const statusCode = (error as { status?: number; statusCode?: number })
    .statusCode;
  return status === 404 || statusCode === 404;
}

async function createSandbox(
  context: SlackMessageContext,
  threadId: string
): Promise<ResolvedSandboxSession> {
  await setStatus(context, {
    status: 'is provisioning a sandbox',
    loading: true,
  });

  const hasSnapshot = await daytona.snapshot
    .get(SANDBOX_SNAPSHOT)
    .then(() => true)
    .catch(() => false);

  if (!hasSnapshot) {
    await createSnapshot(daytona);
  }

  const sandbox = await daytona.create({
    autoStopInterval: config.timeouts.stopMinutes,
    autoArchiveInterval: config.timeouts.archiveMinutes,
    autoDeleteInterval: config.timeouts.deleteMinutes,
    snapshot: SANDBOX_SNAPSHOT,
  });

  const prompt = systemPrompt({ agent: 'sandbox' });
  await sandbox.fs.uploadFile(
    Buffer.from(buildConfig(prompt), 'utf8'),
    CONFIG_PATH
  );

  await setStatus(context, { status: 'is starting agent', loading: true });
  const { sdk, access } = await boot(sandbox);
  const session = await createSession(sdk, threadId);

  await upsert({
    threadId,
    sandboxId: sandbox.id,
    sessionId: session.id,
    status: 'active',
  });

  logger.info(
    { threadId, sandboxId: sandbox.id },
    '[sandbox] Created sandbox session'
  );

  return {
    sdk,
    sandbox,
    session,
    sessionId: session.id,
    baseUrl: access.baseUrl,
  };
}

async function reconnectSandboxById(
  threadId: string,
  sandboxId: string
): Promise<Sandbox> {
  const sandbox = await daytona.get(sandboxId).catch((error: unknown) => {
    if (isNotFoundError(error)) {
      return null;
    }
    logger.warn(
      { error, sandboxId, threadId },
      '[sandbox] Failed to load existing Daytona sandbox'
    );
    throw error;
  });

  if (!sandbox) {
    await clearDestroyed(threadId);
    throw new SandboxNotFoundError(
      `Sandbox ${sandboxId} no longer exists for thread ${threadId}`
    );
  }

  if (sandbox.state !== 'started') {
    await sandbox.start().catch((error: unknown) => {
      logger.warn(
        { error, sandboxId, threadId },
        '[sandbox] Failed to start existing Daytona sandbox'
      );
      throw error;
    });
  }

  return sandbox;
}

export async function resolveSession(
  context: SlackMessageContext
): Promise<ResolvedSandboxSession> {
  const threadId = getContextId(context);

  const existing = await getByThread(threadId);

  if (!existing) {
    return createSandbox(context, threadId);
  }

  await updateStatus(threadId, 'resuming');

  try {
    const sandbox = await reconnectSandboxById(
      threadId,
      existing.sandboxId
    ).catch((error: unknown) => {
      if (error instanceof SandboxNotFoundError) {
        return null;
      }
      throw error;
    });
    if (!sandbox) {
      return createSandbox(context, threadId);
    }

    const { sdk, access } = await boot(sandbox);
    const session = await ensureSession(sdk, existing.sessionId);

    await updateRuntime(threadId, {
      sandboxId: sandbox.id,
      sessionId: session.id,
      status: 'active',
    });
    await markActivity(threadId);

    return {
      sdk,
      sandbox,
      session,
      sessionId: session.id,
      baseUrl: access.baseUrl,
    };
  } catch (error) {
    await updateStatus(threadId, 'error');
    throw error;
  }
}

export async function getSandbox(
  context: SlackMessageContext
): Promise<Sandbox> {
  const resolved = await resolveSession(context);
  return resolved.sandbox;
}

export async function reconnectSandbox(
  context: SlackMessageContext
): Promise<Sandbox | null> {
  const threadId = getContextId(context);
  const existing = await getByThread(threadId);
  if (!existing) {
    return null;
  }

  return reconnectSandboxById(threadId, existing.sandboxId);
}

export async function stopSandbox(context: SlackMessageContext): Promise<void> {
  const threadId = getContextId(context);
  const existing = await getByThread(threadId);
  if (existing) {
    const sandbox = await daytona.get(existing.sandboxId).catch(() => null);
    if (sandbox?.state === 'started') {
      await sandbox.stop().catch((error: unknown) => {
        logger.warn(
          { error, threadId, sandboxId: existing.sandboxId },
          '[sandbox] Failed to stop sandbox'
        );
      });
    }
  }
  await updateStatus(threadId, 'paused');
}
