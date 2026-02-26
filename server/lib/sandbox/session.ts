import { Sandbox } from '@e2b/code-interpreter';
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
import logger from '~/lib/logger';
import type { ResolvedSandboxSession, SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { toLogError } from '~/utils/error';
import { contextChannel } from '~/utils/slack-event';
import { configureAgent } from './config';
import { boot } from './rpc';
import { buildTemplateIfMissing, getTemplate } from './template.build';

function isMissingSandboxError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('not found') ||
    message.includes('404') ||
    message.includes('does not exist')
  );
}

function getChannelId(context: SlackMessageContext): string {
  const channelId = contextChannel(context);
  if (!(typeof channelId === 'string' && channelId.length > 0)) {
    throw new Error('Missing Slack channel ID for sandbox session');
  }
  return channelId;
}

function getSandboxMetadata(context: SlackMessageContext, threadId: string) {
  return {
    threadId,
    channelId: getChannelId(context),
    app: 'gorkie-slack',
  } as const;
}

function connectSandbox(sandboxId: string): Promise<Sandbox | null> {
  return Sandbox.connect(sandboxId, {
    apiKey: env.E2B_API_KEY,
    timeoutMs: config.timeoutMs,
  }).catch((error: unknown) => {
    if (isMissingSandboxError(error)) {
      return null;
    }
    throw error;
  });
}

async function createSandbox(
  context: SlackMessageContext,
  threadId: string
): Promise<ResolvedSandboxSession> {
  const template = getTemplate();
  await buildTemplateIfMissing(template);

  const sandbox = await Sandbox.betaCreate(template, {
    apiKey: env.E2B_API_KEY,
    timeoutMs: config.timeoutMs,
    autoPause: true,
    allowInternetAccess: true,
    metadata: getSandboxMetadata(context, threadId),
  });

  await sandbox.setTimeout(config.timeoutMs);

  try {
    await configureAgent(sandbox, systemPrompt({ agent: 'sandbox', context }));
    const client = await boot(sandbox);
    const { sessionId } = await client.getState();

    await upsert({
      threadId,
      sandboxId: sandbox.sandboxId,
      sessionId,
      status: 'active',
    });
    logger.info(
      { threadId, sandboxId: sandbox.sandboxId, sessionId, template },
      '[sandbox] Created sandbox'
    );

    return { client, sandbox };
  } catch (error) {
    await Sandbox.kill(sandbox.sandboxId, { apiKey: env.E2B_API_KEY }).catch(
      () => null
    );
    throw error;
  }
}

async function resumeSandbox(
  threadId: string,
  sandboxId: string,
  sessionId: string
): Promise<ResolvedSandboxSession> {
  const sandbox = await connectSandbox(sandboxId);

  if (!sandbox) {
    await clearDestroyed(threadId);
    throw new Error(`[sandbox] Sandbox ${sandboxId} not found`);
  }

  await sandbox.setTimeout(config.timeoutMs);

  const client = await boot(sandbox, sessionId);

  const state = await client.getState();
  logger.debug(
    { threadId, sessionId: state.sessionId },
    '[sandbox] Resumed session'
  );

  await updateRuntime(threadId, {
    sandboxId: sandbox.sandboxId,
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
      if (isMissingSandboxError(error)) {
        return createSandbox(context, threadId);
      }
      throw error;
    });
  } catch (error) {
    logger.warn(
      { ...toLogError(error), threadId },
      '[sandbox] Failed to resume, creating new sandbox'
    );
    await updateStatus(threadId, 'error');
    throw error;
  }
}

export async function pauseSession(
  context: SlackMessageContext,
  sandboxId: string
): Promise<void> {
  const threadId = getContextId(context);

  try {
    await Sandbox.betaPause(sandboxId, { apiKey: env.E2B_API_KEY });
    await updateStatus(threadId, 'paused');
    logger.info({ threadId, sandboxId }, '[sandbox] Paused sandbox');
  } catch (error) {
    logger.warn(
      { ...toLogError(error), threadId, sandboxId },
      '[sandbox] Failed to pause sandbox'
    );
  }
}
