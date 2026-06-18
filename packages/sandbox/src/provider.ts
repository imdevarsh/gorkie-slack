import type { HarnessV1SandboxProvider } from '@ai-sdk/harness';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { Sandbox } from '@e2b/code-interpreter';
import {
  getByThread,
  markActivity,
  updateResumeState,
  updateRuntime,
  upsert,
} from '@repo/db/queries';
import type { Logger } from '@repo/logging/logger';
import { sandboxConfig } from './config';
import { E2BNetworkSandboxSession, isMissingSandboxError } from './session';

const PROVIDER_ID = 'e2b';
const SPECIFICATION_VERSION = 'harness-sandbox-v1';

export interface E2BSandboxProviderOptions {
  apiKey: string;
  logger: Logger;
  template?: string;
}

export class E2BSandboxProvider implements HarnessV1SandboxProvider {
  readonly providerId = PROVIDER_ID;
  readonly specificationVersion = SPECIFICATION_VERSION;

  private readonly apiKey: string;
  private readonly template: string;
  private readonly logger: Logger;

  constructor(options: E2BSandboxProviderOptions) {
    this.apiKey = options.apiKey;
    this.template = options.template ?? sandboxConfig.template;
    this.logger = options.logger;
  }

  private readonly spawnSandbox = async (
    sessionId?: string
  ): Promise<Sandbox> => {
    const sandbox = await Sandbox.betaCreate(this.template, {
      apiKey: this.apiKey,
      autoPause: true,
      allowInternetAccess: true,
      timeoutMs: sandboxConfig.timeoutMs,
      metadata: {
        app: 'gorkie',
        ...(sessionId ? { threadId: sessionId } : {}),
      },
    });
    await sandbox.setTimeout(sandboxConfig.timeoutMs);
    await sandbox.files.makeDir(sandboxConfig.workdir).catch(() => undefined);
    return sandbox;
  };

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

    const existing = sessionId ? await getByThread(sessionId) : null;
    let sandbox = existing
      ? await Sandbox.connect(existing.sandboxId, {
          apiKey: this.apiKey,
          timeoutMs: sandboxConfig.timeoutMs,
        }).catch((error: unknown) => {
          if (isMissingSandboxError(error)) {
            return null;
          }
          throw error;
        })
      : null;
    if (sandbox && sessionId) {
      await sandbox
        .setTimeout(sandboxConfig.timeoutMs)
        .then(() => sandbox?.files.makeDir(sandboxConfig.workdir))
        .catch((error: unknown) => {
          if (isMissingSandboxError(error)) {
            sandbox = null;
            return;
          }
          throw error;
        });
    }

    if (sandbox && sessionId) {
      await markActivity(sessionId);
      this.logger.debug(
        { sessionId, sandboxId: sandbox.sandboxId },
        '[sandbox] reused e2b sandbox'
      );
      return new E2BNetworkSandboxSession(sandbox);
    }

    const nextSandbox = await this.spawnSandbox(sessionId);
    const session = new E2BNetworkSandboxSession(nextSandbox);
    await onFirstCreate?.(session.restricted(), { abortSignal });

    if (sessionId) {
      await upsert({
        threadId: sessionId,
        sandboxId: nextSandbox.sandboxId,
        sessionId,
        status: 'active',
      });
    }

    this.logger.info(
      { sessionId, sandboxId: nextSandbox.sandboxId, template: this.template },
      '[sandbox] created e2b sandbox'
    );

    return session;
  };

  pauseSession = async (threadId: string): Promise<void> => {
    const existing = await getByThread(threadId);
    if (!existing) {
      return;
    }
    try {
      await Sandbox.pause(existing.sandboxId, { apiKey: this.apiKey });
      await updateResumeState({
        resumeState: existing.resumeState,
        status: 'paused',
        threadId,
      });
    } catch (error) {
      this.logger.warn(
        { err: error, threadId },
        '[sandbox] failed to pause e2b sandbox'
      );
    }
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
      throw new Error(`[sandbox] missing e2b sandbox for ${sessionId}`);
    }

    let sandbox = await Sandbox.connect(existing.sandboxId, {
      apiKey: this.apiKey,
      timeoutMs: sandboxConfig.timeoutMs,
    }).catch((error: unknown) => {
      if (isMissingSandboxError(error)) {
        return null;
      }
      throw error;
    });
    if (sandbox) {
      await sandbox.setTimeout(sandboxConfig.timeoutMs);
      this.logger.debug(
        { sessionId, sandboxId: sandbox.sandboxId },
        '[sandbox] resumed e2b sandbox'
      );
    } else {
      sandbox = await this.spawnSandbox(sessionId);
      this.logger.info(
        {
          previous: existing.sandboxId,
          sandboxId: sandbox.sandboxId,
          sessionId,
        },
        '[sandbox] recreated e2b sandbox from mirror'
      );
    }

    await updateRuntime(sessionId, {
      sandboxId: sandbox.sandboxId,
      sessionId,
      status: 'active',
    });
    await markActivity(sessionId);

    return new E2BNetworkSandboxSession(sandbox);
  };
}
