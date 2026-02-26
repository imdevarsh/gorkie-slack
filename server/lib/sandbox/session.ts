import type { Sandbox } from '@daytonaio/sdk';
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
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { configureAgent } from './config';
import {
  bringOnline,
  daytona,
  isNotFoundError,
  SandboxNotFoundError,
} from './daytona';
import { boot, type PiRpcClient } from './rpc';
import { createSnapshot, SANDBOX_SNAPSHOT } from './snapshot';

export interface ResolvedSandboxSession {
  client: PiRpcClient;
  sandbox: Sandbox;
}

async function createSandbox(
  context: SlackMessageContext,
  threadId: string
): Promise<ResolvedSandboxSession> {
  const hasSnapshot = await daytona.snapshot
    .get(SANDBOX_SNAPSHOT)
    .then(() => true)
    .catch((error: unknown) => {
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    });

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
    await configureAgent(sandbox, systemPrompt({ agent: 'sandbox', context }));
    const client = await boot(sandbox);
    const { sessionId } = await client.getState();

    await upsert({
      threadId,
      sandboxId: sandbox.id,
      sessionId,
      status: 'active',
    });
    logger.info(
      { threadId, sandboxId: sandbox.id, sessionId },
      '[sandbox] Created sandbox'
    );

    return { client, sandbox };
  } catch (error) {
    await sandbox.stop().catch(() => null);
    throw error;
  }
}

async function resumeSandbox(
  threadId: string,
  sandboxId: string,
  sessionId: string
): Promise<ResolvedSandboxSession> {
  const sandbox = await daytona.get(sandboxId).catch((error: unknown) => {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  });

  if (!sandbox) {
    await clearDestroyed(threadId);
    throw new SandboxNotFoundError(`Sandbox ${sandboxId} not found`);
  }

  await bringOnline(sandbox, threadId);

  const client = await boot(sandbox, sessionId);

  const state = await client.getState();
  logger.debug(
    { threadId, sessionId: state.sessionId },
    '[sandbox] Resumed session'
  );

  await updateRuntime(threadId, {
    sandboxId: sandbox.id,
    sessionId: state.sessionId,
    status: 'active',
  });
  await markActivity(threadId);

  return { client, sandbox };
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
    return await resumeSandbox(
      threadId,
      existing.sandboxId,
      existing.sessionId
    ).catch((error: unknown) => {
      if (error instanceof SandboxNotFoundError) {
        return createSandbox(context, threadId);
      }
      throw error;
    });
  } catch (error) {
    await updateStatus(threadId, 'error');
    throw error;
  }
}
