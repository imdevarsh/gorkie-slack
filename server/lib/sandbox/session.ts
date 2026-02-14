import { readFileSync } from 'node:fs';
import { Daytona, type Sandbox } from '@daytonaio/sdk';
import { SandboxAgent, type Session } from 'sandbox-agent';
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
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { type PreviewAccess, waitForHealth } from './client';
import { createSnapshot, SANDBOX_SNAPSHOT } from './snapshot';

const OPENCODE_CONFIG_PATH = `${config.runtime.workdir}/opencode.json`;
const PROMPT_PATH = new URL('../ai/prompts/sandbox.md', import.meta.url);

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

function buildOpencodeConfig(prompt: string): string {
  return JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
      model: 'openrouter/openai/gpt-5-mini',
      share: 'disabled',
      permission: 'allow',
      provider: {
        openrouter: {
          options: {
            baseURL: 'https://ai.hackclub.com/proxy/v1',
            apiKey: '{env:HACKCLUB_API_KEY}',
          },
          models: {
            'openai/gpt-5-mini': {},
          },
        },
      },
      agent: {
        gorkie: {
          mode: 'primary',
          prompt,
        },
      },
    },
    null,
    2
  );
}

async function startAgentServer(sandbox: Sandbox): Promise<void> {
  const command = `pkill -f "sandbox-agent server" >/dev/null 2>&1 || true; nohup sandbox-agent server --no-token --host 0.0.0.0 --port ${config.runtime.agentPort} >/tmp/sandbox-agent.log 2>&1 &`;

  const result = await sandbox.process.executeCommand(
    command,
    config.runtime.workdir,
    {
      HACKCLUB_API_KEY: env.HACKCLUB_API_KEY,
    }
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to start sandbox-agent server: ${result.result}`);
  }
}

async function previewAccess(sandbox: Sandbox): Promise<PreviewAccess> {
  const signed = await sandbox.getSignedPreviewUrl(
    config.runtime.agentPort,
    config.timeouts.previewTtlSeconds
  );

  const parsed = new URL(signed.url);
  const previewToken = parsed.searchParams.get('tkn');
  parsed.searchParams.delete('tkn');

  return {
    baseUrl: parsed.toString(),
    previewToken,
  };
}

function connectSdk(access: PreviewAccess): Promise<SandboxAgent> {
  return SandboxAgent.connect({
    baseUrl: access.baseUrl,
    ...(access.previewToken
      ? {
          headers: {
            'x-daytona-preview-token': access.previewToken,
          },
        }
      : {}),
  });
}

async function ensureSession(
  sdk: SandboxAgent,
  sessionId: string
): Promise<Session> {
  const resumed = await sdk.resumeSession(sessionId).catch(() => null);
  if (resumed) {
    return resumed;
  }

  return sdk.createSession({
    id: sessionId,
    agent: 'opencode',
    sessionInit: {
      cwd: config.runtime.workdir,
      mcpServers: [],
    },
  });
}

async function createSandbox(
  context: SlackMessageContext,
  threadId: string,
  channelId: string
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

  const prompt = readFileSync(PROMPT_PATH, 'utf8');
  await sandbox.fs.uploadFile(
    Buffer.from(buildOpencodeConfig(prompt), 'utf8'),
    OPENCODE_CONFIG_PATH
  );

  await setStatus(context, { status: 'is starting agent', loading: true });
  await startAgentServer(sandbox);

  const access = await previewAccess(sandbox);
  await waitForHealth(access, config.timeouts.healthMs);

  const sdk = await connectSdk(access);
  const session = await sdk.createSession({
    id: threadId,
    agent: 'opencode',
    sessionInit: {
      cwd: config.runtime.workdir,
      mcpServers: [],
    },
  });

  await upsert({
    threadId,
    channelId,
    sandboxId: sandbox.id,
    sessionId: session.id,
    previewUrl: access.baseUrl,
    previewToken: access.previewToken,
    previewExpiresAt: null,
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
  const channelId = context.event.channel ?? 'unknown-channel';

  const existing = await getByThread(threadId);

  if (!existing) {
    return createSandbox(context, threadId, channelId);
  }

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
    return createSandbox(context, threadId, channelId);
  }

  const access = await previewAccess(sandbox);
  await waitForHealth(access, config.timeouts.healthMs).catch(async () => {
    await startAgentServer(sandbox);
    await waitForHealth(access, config.timeouts.healthMs);
  });

  const sdk = await connectSdk(access);
  const session = await ensureSession(sdk, existing.sessionId);

  await updateRuntime(threadId, {
    sandboxId: sandbox.id,
    sessionId: session.id,
    previewUrl: access.baseUrl,
    previewToken: access.previewToken,
    previewExpiresAt: null,
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
