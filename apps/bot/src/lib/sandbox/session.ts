import { Sandbox } from '@e2b/code-interpreter';
import { systemPrompt } from '@repo/ai/prompts';
import {
  clearDestroyed,
  getByThread,
  issueProxyToken,
  markActivity,
  revokeProxyToken,
  updateRuntime,
  updateStatus,
  upsert,
} from '@repo/db/queries';
import { toLogError } from '@repo/utils/error';
import { sandbox as config } from '@/config';
import { env } from '@/env';
import logger from '@/lib/logger';
import type { ResolvedSandboxSession, SlackMessageContext } from '@/types';
import { getContextId } from '@/utils/context';
import { configureAgent } from './config';
import { boot } from './rpc/boot';

function isMissingSandboxError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('not found') ||
    message.includes('404') ||
    message.includes('does not exist')
  );
}

function getChannelId(context: SlackMessageContext): string {
  const channelId = context.event.channel;
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

async function getSandboxOutboundIp(sandbox: Sandbox): Promise<string | null> {
  const result = await sandbox.commands
    .run(`curl -fsS --max-time 5 ${env.PROXY_BASE_URL}/ip`, {
      timeoutMs: 10_000,
    })
    .catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), sandboxId: sandbox.sandboxId },
        '[sandbox] Failed to resolve outbound IP'
      );
      return null;
    });

  if (!result || result.exitCode !== 0) {
    return null;
  }

  try {
    const { ip } = JSON.parse(result.stdout) as { ip: string | null };
    return ip ?? null;
  } catch {
    return null;
  }
}

async function issueSessionProxyToken({
  sandbox,
  sandboxId,
}: {
  sandbox: Sandbox;
  sandboxId: string;
}): Promise<string> {
  const allowedIp = await getSandboxOutboundIp(sandbox);
  const { token } = await issueProxyToken({
    allowedIp,
    sandboxId,
    ttlMs: config.runtime.executionTimeoutMs,
  });
  return token;
}

async function createSandbox(
  context: SlackMessageContext,
  threadId: string
): Promise<ResolvedSandboxSession> {
  const template = config.template;

  const sandbox = await Sandbox.betaCreate(template, {
    apiKey: env.E2B_API_KEY,
    timeoutMs: config.timeoutMs,
    autoPause: true,
    allowInternetAccess: true,
    metadata: getSandboxMetadata(context, threadId),
  });

  await sandbox.setTimeout(config.timeoutMs);

  try {
    const proxyToken = await issueSessionProxyToken({
      sandbox,
      sandboxId: sandbox.sandboxId,
    });
    await configureAgent(sandbox, systemPrompt({ agent: 'sandbox', context }));
    const client = await boot({ sandbox, proxyToken });
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
    await revokeProxyToken({ sandboxId: sandbox.sandboxId }).catch(() => null);
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

  const proxyToken = await issueSessionProxyToken({
    sandbox,
    sandboxId: sandbox.sandboxId,
  });
  const client = await boot({ sandbox, sessionId, proxyToken }).catch(
    async (error: unknown) => {
      await revokeProxyToken({ sandboxId: sandbox.sandboxId }).catch(
        () => null
      );
      throw error;
    }
  );

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

export function revokeSessionProxyToken(sandboxId: string): Promise<void> {
  return revokeProxyToken({ sandboxId });
}
