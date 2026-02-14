import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Daytona, type Sandbox } from '@daytonaio/sdk';
import { sql } from 'drizzle-orm';
import { SandboxAgent, type Session } from 'sandbox-agent';
import { sandbox as config } from '~/config';
import { db } from '~/db';
import { env } from '~/env';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { type PreviewAccess, parsePreviewUrl, waitForHealth } from './client';
import { getSandboxImage } from './image';
import {
  clearDestroyed,
  getByThread,
  markActivity,
  updateRuntime,
  updateStatus,
  upsert,
} from './queries';

const AGENT_PORT = 3000;
const PREVIEW_TTL_SECONDS = 4 * 60 * 60;
const HOME_DIR = '/home/daytona';
const OPENCODE_CONFIG_PATH = `${HOME_DIR}/opencode.json`;
const PROMPT_PATH = new URL('./prompt.md', import.meta.url);

const daytona = new Daytona({
  apiKey: config.daytona.apiKey,
  ...(config.daytona.apiUrl ? { apiUrl: config.daytona.apiUrl } : {}),
  ...(config.daytona.target ? { target: config.daytona.target } : {}),
});

const threadLocks = new Map<string, Promise<void>>();

export interface ResolvedSandboxSession {
  sdk: SandboxAgent;
  sandbox: Sandbox;
  session: Session;
  sessionId: string;
  baseUrl: string;
}

function advisoryLockKey(threadId: string): bigint {
  const digest = createHash('sha256').update(threadId).digest();
  const firstEight = digest.subarray(0, 8);
  const hex = firstEight.toString('hex');
  return BigInt.asUintN(63, BigInt(`0x${hex}`));
}

async function withThreadLock<T>(
  threadId: string,
  fn: () => Promise<T>
): Promise<T> {
  const previous = threadLocks.get(threadId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  threadLocks.set(
    threadId,
    previous.then(() => current)
  );
  await previous;

  try {
    return await fn();
  } finally {
    release();
    if (threadLocks.get(threadId) === current) {
      threadLocks.delete(threadId);
    }
  }
}

function withDbAdvisoryLock<T>(
  threadId: string,
  fn: (database: typeof db) => Promise<T>
): Promise<T> {
  const key = advisoryLockKey(threadId);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${key});`);
    return fn(tx as unknown as typeof db);
  });
}

function buildOpencodeConfig(prompt: string): string {
  return JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
      share: 'disabled',
      permission: 'allow',
      provider: {
        openrouter: { models: {} },
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
  const result = await sandbox.process.executeCommand(
    'pkill -f "sandbox-agent server" >/dev/null 2>&1 || true; nohup sandbox-agent server --token "$SANDBOX_AGENT_TOKEN" --host 0.0.0.0 --port 3000 >/tmp/sandbox-agent.log 2>&1 &',
    HOME_DIR,
    {
      HACKCLUB_API_KEY: env.SANDBOX_HACKCLUB_API_KEY,
      SANDBOX_AGENT_TOKEN: env.SANDBOX_AGENT_TOKEN,
    }
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to start sandbox-agent server: ${result.result}`);
  }
}

async function previewAccess(
  sandbox: Sandbox
): Promise<PreviewAccess & { expiresAt: Date }> {
  const signed = await sandbox.getSignedPreviewUrl(
    AGENT_PORT,
    PREVIEW_TTL_SECONDS
  );
  const access = parsePreviewUrl(signed.url);
  return {
    ...access,
    expiresAt: new Date(Date.now() + PREVIEW_TTL_SECONDS * 1000),
  };
}

function connectSdk(access: PreviewAccess): Promise<SandboxAgent> {
  return SandboxAgent.connect({
    baseUrl: access.baseUrl,
    token: env.SANDBOX_AGENT_TOKEN,
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
      cwd: HOME_DIR,
      mcpServers: [],
    },
  });
}

async function createSandbox(
  context: SlackMessageContext,
  threadId: string,
  channelId: string,
  database: typeof db
): Promise<ResolvedSandboxSession> {
  await setStatus(context, {
    status: 'is setting up the sandbox',
    loading: true,
  });

  const createOptions = {
    autoStopInterval: config.autoStopMinutes,
    autoArchiveInterval: config.autoArchiveMinutes,
    autoDeleteInterval: config.autoDeleteMinutes,
    language: 'typescript',
    image: getSandboxImage(),
  } as const;

  const sandbox = config.daytona.snapshot
    ? await daytona.create({
        ...createOptions,
        snapshot: config.daytona.snapshot,
      })
    : await daytona.create(createOptions);

  const prompt = readFileSync(PROMPT_PATH, 'utf8');
  await sandbox.fs.uploadFile(
    Buffer.from(buildOpencodeConfig(prompt), 'utf8'),
    OPENCODE_CONFIG_PATH
  );

  await startAgentServer(sandbox);

  const access = await previewAccess(sandbox);
  await waitForHealth(access, env.SANDBOX_AGENT_TOKEN);

  const sdk = await connectSdk(access);
  const session = await sdk.createSession({
    id: threadId,
    agent: 'opencode',
    sessionInit: {
      cwd: HOME_DIR,
      mcpServers: [],
    },
  });

  await upsert(
    {
      threadId,
      channelId,
      sandboxId: sandbox.id,
      sessionId: session.id,
      previewUrl: access.baseUrl,
      previewToken: access.previewToken,
      previewExpiresAt: access.expiresAt,
      status: 'active',
    },
    database
  );

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
): Promise<Sandbox | null> {
  const sandbox = await daytona.get(sandboxId).catch(() => null);
  if (!sandbox) {
    await clearDestroyed(threadId);
    return null;
  }

  if (sandbox.state !== 'started') {
    const started = await sandbox.start().catch((error: unknown) => {
      logger.warn(
        { error, sandboxId, threadId },
        '[sandbox] Failed to start existing Daytona sandbox'
      );
      return null;
    });

    if (!started) {
      await clearDestroyed(threadId);
      return null;
    }
  }

  return sandbox;
}

export function resolveSession(
  context: SlackMessageContext
): Promise<ResolvedSandboxSession> {
  const threadId = getContextId(context);
  const channelId = context.event.channel ?? 'unknown-channel';

  return withThreadLock(threadId, () => {
    return withDbAdvisoryLock(threadId, async (database) => {
      const existing = await getByThread(threadId, database);

      if (!existing) {
        return createSandbox(context, threadId, channelId, database);
      }

      const sandbox = await reconnectSandboxById(threadId, existing.sandboxId);
      if (!sandbox) {
        return createSandbox(context, threadId, channelId, database);
      }

      const access = await previewAccess(sandbox);
      await waitForHealth(access, env.SANDBOX_AGENT_TOKEN).catch(async () => {
        await startAgentServer(sandbox);
        await waitForHealth(access, env.SANDBOX_AGENT_TOKEN);
      });

      const sdk = await connectSdk(access);
      const session = await ensureSession(sdk, existing.sessionId);

      await updateRuntime(
        threadId,
        {
          sandboxId: sandbox.id,
          sessionId: session.id,
          previewUrl: access.baseUrl,
          previewToken: access.previewToken,
          previewExpiresAt: access.expiresAt,
          status: 'active',
        },
        database
      );

      await markActivity(threadId, database);

      return {
        sdk,
        sandbox,
        session,
        sessionId: session.id,
        baseUrl: access.baseUrl,
      };
    });
  });
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
  await updateStatus(threadId, 'paused');
}
