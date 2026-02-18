import { Daytona, type Sandbox } from '@daytonaio/sdk';
import {
  buildInspectorUrl,
  type SandboxAgent,
  type Session,
} from 'sandbox-agent';
import { sandbox as config } from '~/config';
import {
  clearDestroyed,
  getByThread,
  markActivity,
  updateRuntime,
  updateStatus,
  upsert,
} from '~/db/queries/sandbox';
import { env } from '~/env';
import { systemPrompt } from '~/lib/ai/prompts';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { configureAgent } from './config';
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

function logInspectorUrl(params: {
  baseUrl: string;
  previewToken: string | null;
  sessionId: string;
  threadId: string;
}): void {
  if (env.NODE_ENV !== 'development') {
    return;
  }

  const { baseUrl, previewToken, sessionId, threadId } = params;
  const inspectorUrl = buildInspectorUrl({
    baseUrl,
    ...(previewToken
      ? {
          headers: {
            'x-daytona-preview-token': previewToken,
          },
        }
      : {}),
  });

  logger.info(
    { threadId, sessionId, inspectorUrl },
    '[sandbox] Inspector UI (dev)'
  );
}

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

  try {
    const prompt = systemPrompt({ agent: 'sandbox', context });
    await configureAgent(sandbox, prompt);

    await setStatus(context, { status: 'is starting agent', loading: true });
    const { sdk, access } = await boot(sandbox);
    const session = await createSession(sdk, threadId);
    logInspectorUrl({
      baseUrl: access.baseUrl,
      previewToken: access.previewToken,
      sessionId: session.id,
      threadId,
    });

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
  } catch (error) {
    await sandbox.stop().catch((stopError: unknown) => {
      logger.warn(
        { error: stopError, sandboxId: sandbox.id, threadId },
        '[sandbox] Failed to stop sandbox after creation failure'
      );
    });
    throw error;
  }
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
    logInspectorUrl({
      baseUrl: access.baseUrl,
      previewToken: access.previewToken,
      sessionId: session.id,
      threadId,
    });

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
