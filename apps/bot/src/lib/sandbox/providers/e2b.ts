import type { HarnessV1SandboxProvider } from '@ai-sdk/harness';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { Sandbox } from '@e2b/code-interpreter';
import {
  clearDestroyed,
  getByThread,
  markActivity,
  updateRuntime,
  upsert,
} from '@repo/db/queries';
import { toLogError } from '@repo/utils/error';
import { sandbox as config } from '@/config';
import { env } from '@/env';
import logger from '@/lib/logger';
import { E2BNetworkSandboxSession, isMissingSandboxError } from './e2b-session';

interface E2BSandboxProviderSettings {
  template: string;
}

const E2B_PROVIDER_ID = 'e2b';

class E2BSandboxProvider implements HarnessV1SandboxProvider {
  readonly providerId = E2B_PROVIDER_ID;
  readonly specificationVersion = 'harness-sandbox-v1';
  private readonly settings: E2BSandboxProviderSettings;

  constructor(settings: E2BSandboxProviderSettings) {
    this.settings = settings;
  }

  createSession = async ({
    abortSignal,
    onFirstCreate,
    sessionId,
  }: {
    abortSignal?: AbortSignal;
    identity?: string;
    onFirstCreate?: (
      session: Experimental_SandboxSession,
      opts: { abortSignal?: AbortSignal }
    ) => Promise<void>;
    sessionId?: string;
  } = {}) => {
    abortSignal?.throwIfAborted();

    const sandbox = await Sandbox.betaCreate(this.settings.template, {
      apiKey: env.E2B_API_KEY,
      autoPause: true,
      allowInternetAccess: true,
      timeoutMs: config.timeoutMs,
      metadata: {
        app: 'gorkie-slack',
        ...(sessionId ? { threadId: sessionId } : {}),
      },
    });

    await sandbox.setTimeout(config.timeoutMs);
    const session = new E2BNetworkSandboxSession(sandbox);
    await sandbox.files.makeDir(config.runtime.workdir).catch(() => undefined);
    await onFirstCreate?.(session.restricted(), { abortSignal });

    if (sessionId) {
      await upsert({
        threadId: sessionId,
        sandboxId: sandbox.sandboxId,
        sessionId,
        status: 'active',
      });
    }

    logger.info(
      {
        sessionId,
        sandboxId: sandbox.sandboxId,
        template: this.settings.template,
      },
      '[sandbox] Created E2B harness sandbox'
    );

    return session;
  };

  resumeSession = async ({
    abortSignal,
    sessionId,
  }: {
    abortSignal?: AbortSignal;
    sessionId: string;
  }) => {
    abortSignal?.throwIfAborted();

    const existing = await getByThread(sessionId);
    if (!existing) {
      throw new Error(`[sandbox] Missing E2B sandbox for ${sessionId}`);
    }

    const sandbox = await Sandbox.connect(existing.sandboxId, {
      apiKey: env.E2B_API_KEY,
      timeoutMs: config.timeoutMs,
    }).catch((error: unknown) => {
      if (isMissingSandboxError(error)) {
        return null;
      }
      throw error;
    });

    if (!sandbox) {
      await clearDestroyed(sessionId);
      throw new Error(`[sandbox] E2B sandbox ${existing.sandboxId} not found`);
    }

    await sandbox.setTimeout(config.timeoutMs);
    await updateRuntime(sessionId, {
      sandboxId: sandbox.sandboxId,
      sessionId,
      status: 'active',
    });
    await markActivity(sessionId);

    logger.debug(
      { sessionId, sandboxId: sandbox.sandboxId },
      '[sandbox] Resumed E2B harness sandbox'
    );

    return new E2BNetworkSandboxSession(sandbox);
  };
}

export function createE2BSandboxProvider({
  template,
}: E2BSandboxProviderSettings): HarnessV1SandboxProvider {
  return new E2BSandboxProvider({ template });
}

export async function destroyE2BSandboxById({
  sandboxId,
}: {
  sandboxId: string;
}): Promise<void> {
  await Sandbox.kill(sandboxId, { apiKey: env.E2B_API_KEY }).catch(
    (error: unknown) => {
      logger.warn(
        { ...toLogError(error), sandboxId },
        '[sandbox] Failed to destroy E2B sandbox'
      );
    }
  );
}
