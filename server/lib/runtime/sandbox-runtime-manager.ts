import { Daytona, type Sandbox } from '@daytonaio/sdk';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { runtimeConfig } from '~/config';
import {
  getThreadSession,
  incrementResumeFailure,
  listExpiredPausedSessions,
  listSessionsByStatus,
  listStaleActiveSessions,
  markThreadActivity,
  markThreadHealthOk,
  updateThreadStatus,
  upsertThreadSession,
} from '~/db/repositories/session-repository';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import type { SlackFile } from '~/utils/images';
import { syncRuntimeAttachments } from './attachments';
import { getRuntimeImage } from './daytona-image';
import {
  createRuntimeSession,
  listRuntimeSessions,
  runtimeSessionExists,
  sendRuntimePrompt,
  waitForRuntimeHealth,
} from './opencode-client';
import type { ThreadSessionRecord } from './types';

const daytona = new Daytona({
  apiKey: runtimeConfig.daytona.apiKey,
  ...(runtimeConfig.daytona.apiUrl ? { apiUrl: runtimeConfig.daytona.apiUrl } : {}),
  ...(runtimeConfig.daytona.target ? { target: runtimeConfig.daytona.target } : {}),
});

const threadLocks = new Map<string, Promise<void>>();

async function withThreadLock<T>(
  threadSessionKey: string,
  execute: () => Promise<T>
): Promise<T> {
  const previousLock = threadLocks.get(threadSessionKey) ?? Promise.resolve();
  let releaseLock!: () => void;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  threadLocks.set(threadSessionKey, previousLock.then(() => currentLock));
  await previousLock;

  try {
    return await execute();
  } finally {
    releaseLock();
    if (threadLocks.get(threadSessionKey) === currentLock) {
      threadLocks.delete(threadSessionKey);
    }
  }
}

async function appendSessionHistory(entry: {
  timestamp: string;
  threadSessionKey: string;
  event: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const line = `${JSON.stringify(entry)}\n`;
  await appendFile(runtimeConfig.output.sessionLogFile, line, 'utf-8').catch(
    () => null
  );
}

async function truncateRuntimeOutput(rawOutput: string): Promise<{
  output: string;
  truncated: boolean;
  fullOutputPath?: string;
}> {
  const lines = rawOutput.split('\n');
  const totalBytes = Buffer.byteLength(rawOutput, 'utf-8');

  if (
    lines.length <= runtimeConfig.output.maxLines &&
    totalBytes <= runtimeConfig.output.maxBytes
  ) {
    return { output: rawOutput, truncated: false };
  }

  const outputLines: string[] = [];
  let bytes = 0;
  for (let index = 0; index < lines.length; index++) {
    if (outputLines.length >= runtimeConfig.output.maxLines) {
      break;
    }
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    const lineBytes = Buffer.byteLength(line, 'utf-8') + (index > 0 ? 1 : 0);
    if (bytes + lineBytes > runtimeConfig.output.maxBytes) {
      break;
    }
    outputLines.push(line);
    bytes += lineBytes;
  }

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.log`;
  const fullOutputPath = `${runtimeConfig.output.directory}/${filename}`;
  await mkdir(runtimeConfig.output.directory, { recursive: true }).catch(
    () => null
  );
  await writeFile(fullOutputPath, rawOutput, 'utf-8').catch(() => null);

  return {
    output: `${outputLines.join('\n')}\n\n... output truncated ...\nFull output saved to ${fullOutputPath}`,
    truncated: true,
    fullOutputPath,
  };
}

function getContextMetadata(context: SlackMessageContext) {
  const threadSessionKey = getContextId(context);
  const channelId = (context.event as { channel?: string }).channel ?? 'unknown';
  const workspaceId = context.teamId ?? 'unknown';
  return { threadSessionKey, channelId, workspaceId };
}

function isSandboxMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('destroyed')
  );
}

async function executeOrThrow(
  sandbox: Sandbox,
  threadSessionKey: string,
  commandLabel: string,
  command: string,
  options?: { cwd?: string; env?: Record<string, string> }
): Promise<string> {
  const response = await sandbox.process.executeCommand(
    command,
    options?.cwd,
    options?.env
  );
  if (response.exitCode !== 0) {
    throw new Error(
      `${commandLabel} failed (exit ${response.exitCode}): ${response.result.slice(0, 400)}`
    );
  }
  await appendSessionHistory({
    timestamp: new Date().toISOString(),
    threadSessionKey,
    event: 'sandbox_command',
    metadata: { commandLabel },
  });
  return response.result.trim();
}

async function ensureSandboxStarted(sandbox: Sandbox): Promise<Sandbox> {
  if (sandbox.state === 'started') {
    return sandbox;
  }
  await sandbox.start();
  return sandbox;
}

async function createSandboxAndSession(
  metadata: ReturnType<typeof getContextMetadata>
): Promise<ThreadSessionRecord> {
  const sandbox = runtimeConfig.daytona.snapshot
    ? await daytona.create({
        snapshot: runtimeConfig.daytona.snapshot,
        labels: {
          app: 'gorkie-slack',
          threadSessionKey: metadata.threadSessionKey,
        },
        autoStopInterval: 0,
        autoArchiveInterval: 0,
      })
    : await daytona.create(
        {
          image: getRuntimeImage(),
          labels: {
            app: 'gorkie-slack',
            threadSessionKey: metadata.threadSessionKey,
          },
          autoStopInterval: 0,
          autoArchiveInterval: 0,
        },
        { timeout: runtimeConfig.sandboxCreationTimeoutSeconds }
      );

  const home = await executeOrThrow(
    sandbox,
    metadata.threadSessionKey,
    'discover_home',
    'echo $HOME'
  );

  await executeOrThrow(
    sandbox,
    metadata.threadSessionKey,
    'clone_opencode',
    `git clone --depth=1 https://github.com/anomalyco/opencode.git ${home}/opencode`
  );

  const authJson = JSON.stringify({
    openrouter: { type: 'api', key: runtimeConfig.opencode.apiKey },
  });
  await executeOrThrow(
    sandbox,
    metadata.threadSessionKey,
    'write_auth',
    `mkdir -p ${home}/.local/share/opencode && cat > ${home}/.local/share/opencode/auth.json << 'AUTHEOF'\n${authJson}\nAUTHEOF`
  );

  const configJson = JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    model: runtimeConfig.opencode.model,
    share: 'disabled',
    permission: 'allow',
    provider: {
      openrouter: {
        models: {
          [runtimeConfig.opencode.model]: {},
        },
      },
    },
  });
  const configBase64 = Buffer.from(configJson).toString('base64');
  await executeOrThrow(
    sandbox,
    metadata.threadSessionKey,
    'write_opencode_config',
    `echo "${configBase64}" | base64 -d > ${home}/opencode/opencode.json`
  );

  const runtimeEnv: Record<string, string> = {};
  runtimeEnv.OPENROUTER_API_KEY = runtimeConfig.opencode.apiKey;
  if (runtimeConfig.opencode.openrouterBaseUrl) {
    runtimeEnv.OPENROUTER_BASE_URL = runtimeConfig.opencode.openrouterBaseUrl;
  }
  if (runtimeConfig.opencode.githubToken) {
    runtimeEnv.GH_TOKEN = runtimeConfig.opencode.githubToken;
    runtimeEnv.GITHUB_TOKEN = runtimeConfig.opencode.githubToken;
  }

  await executeOrThrow(
    sandbox,
    metadata.threadSessionKey,
    'start_opencode',
    'setsid opencode serve --port 4096 --hostname 0.0.0.0 > /tmp/opencode.log 2>&1 &',
    {
      cwd: `${home}/opencode`,
      env: runtimeEnv,
    }
  );

  await new Promise((resolve) => setTimeout(resolve, 3000));
  const preview = await sandbox.getPreviewLink(4096);
  const previewUrl = preview.url.replace(/\/$/, '');
  const previewAccessToken = preview.token ?? null;

  const healthy = await waitForRuntimeHealth(
    { previewUrl, previewAccessToken },
    runtimeConfig.resumeHealthTimeoutMs
  );
  if (!healthy) {
    const startupLog = await executeOrThrow(
      sandbox,
      metadata.threadSessionKey,
      'read_opencode_log',
      'cat /tmp/opencode.log 2>/dev/null | tail -100'
    ).catch(() => '(unable to read opencode log)');
    throw new Error(`OpenCode runtime did not become healthy: ${startupLog.slice(0, 300)}`);
  }

  const runtimeSessionId = await createRuntimeSession(
    { previewUrl, previewAccessToken },
    `Slack thread ${metadata.threadSessionKey}`
  );

  return upsertThreadSession({
    threadSessionKey: metadata.threadSessionKey,
    channelId: metadata.channelId,
    workspaceId: metadata.workspaceId,
    sandboxId: sandbox.id,
    runtimeSessionId,
    previewUrl,
    previewAccessToken,
    status: 'active',
  });
}

async function resolveSessionRecord(
  metadata: ReturnType<typeof getContextMetadata>
): Promise<ThreadSessionRecord> {
  const existing = await getThreadSession(metadata.threadSessionKey);
  if (!existing) {
    return createSandboxAndSession(metadata);
  }

  try {
    const sandbox = await daytona.get(existing.sandboxId);
    const started = await ensureSandboxStarted(sandbox);
    const preview = await started.getPreviewLink(4096);
    const previewUrl = preview.url.replace(/\/$/, '');
    const previewAccessToken = preview.token ?? null;

    const healthy = await waitForRuntimeHealth(
      { previewUrl, previewAccessToken },
      runtimeConfig.resumeHealthTimeoutMs
    );
    if (!healthy) {
      await incrementResumeFailure(
        metadata.threadSessionKey,
        'runtime-health-check-failed'
      );
      await updateThreadStatus(
        metadata.threadSessionKey,
        'error',
        'runtime-health-check-failed'
      );
      return createSandboxAndSession(metadata);
    }

    let runtimeSessionId = existing.runtimeSessionId;
    const hasSession = await runtimeSessionExists(
      { previewUrl, previewAccessToken },
      runtimeSessionId
    ).catch(() => false);

    if (!hasSession) {
      const candidateTitle = `Slack thread ${metadata.threadSessionKey}`;
      const sessions = await listRuntimeSessions(
        { previewUrl, previewAccessToken },
        50
      ).catch(() => []);
      const replacement = sessions
        .filter((session) => session.title === candidateTitle)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
      runtimeSessionId =
        replacement?.id ??
        (await createRuntimeSession(
          { previewUrl, previewAccessToken },
          candidateTitle
        ));
    }

    await markThreadHealthOk(metadata.threadSessionKey);
    return upsertThreadSession({
      threadSessionKey: metadata.threadSessionKey,
      channelId: metadata.channelId,
      workspaceId: metadata.workspaceId,
      sandboxId: existing.sandboxId,
      runtimeSessionId,
      previewUrl,
      previewAccessToken,
      status: 'active',
      lastError: null,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await incrementResumeFailure(metadata.threadSessionKey, errorMessage);
    await updateThreadStatus(metadata.threadSessionKey, 'error', errorMessage);

    if (!isSandboxMissingError(error)) {
      logger.warn(
        { error, threadSessionKey: metadata.threadSessionKey },
        'Failed to recover runtime session, recreating sandbox'
      );
    }

    return createSandboxAndSession(metadata);
  }
}

export class SandboxRuntimeManager {
  private cleanupHandle: ReturnType<typeof setInterval> | null = null;

  async sendTask(
    context: SlackMessageContext,
    taskText: string,
    files?: SlackFile[]
  ): Promise<{
    summary: string;
    status: string;
    sessionId: string;
    fullOutputPath?: string;
  }> {
    const metadata = getContextMetadata(context);
    return withThreadLock(metadata.threadSessionKey, async () => {
      const session = await resolveSessionRecord(metadata);
      const sandbox = await daytona.get(session.sandboxId);
      await syncRuntimeAttachments(sandbox, context, files);

      const rawSummary = await sendRuntimePrompt(
        {
          previewUrl: session.previewUrl,
          previewAccessToken: session.previewAccessToken,
        },
        session.runtimeSessionId,
        taskText
      );

      const truncated = await truncateRuntimeOutput(rawSummary);
      await markThreadActivity(metadata.threadSessionKey);
      await appendSessionHistory({
        timestamp: new Date().toISOString(),
        threadSessionKey: metadata.threadSessionKey,
        event: 'runtime_task',
        metadata: {
          sessionId: session.runtimeSessionId,
          truncated: truncated.truncated,
          fullOutputPath: truncated.fullOutputPath ?? null,
        },
      });

      return {
        summary: truncated.output,
        status: session.status,
        sessionId: session.runtimeSessionId,
        fullOutputPath: truncated.fullOutputPath,
      };
    });
  }

  async pauseSession(
    threadSessionKey: string,
    reason: string
  ): Promise<void> {
    await withThreadLock(threadSessionKey, async () => {
      const session = await getThreadSession(threadSessionKey);
      if (!session || session.status === 'paused') {
        return;
      }

      await updateThreadStatus(threadSessionKey, 'pausing', reason);
      try {
        const sandbox = await daytona.get(session.sandboxId);
        await daytona.stop(sandbox);
        await updateThreadStatus(threadSessionKey, 'paused');
      } catch (error) {
        await updateThreadStatus(
          threadSessionKey,
          'destroyed',
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  }

  async destroySession(
    threadSessionKey: string,
    reason: string
  ): Promise<void> {
    await withThreadLock(threadSessionKey, async () => {
      const session = await getThreadSession(threadSessionKey);
      if (!session) {
        return;
      }

      await updateThreadStatus(threadSessionKey, 'destroying', reason);
      try {
        const sandbox = await daytona.get(session.sandboxId);
        await daytona.delete(sandbox);
      } catch {
        // no-op
      }
      await updateThreadStatus(threadSessionKey, 'destroyed');
    });
  }

  startCleanupLoop(): void {
    if (this.cleanupHandle) {
      return;
    }

    this.cleanupHandle = setInterval(async () => {
      try {
        const staleActive = await listStaleActiveSessions(
          runtimeConfig.sandboxTimeoutMinutes
        );
        for (const session of staleActive) {
          await this.pauseSession(session.threadSessionKey, 'stale-active');
        }

        const expiredPaused = await listExpiredPausedSessions(
          runtimeConfig.pausedTtlMinutes
        );
        for (const session of expiredPaused) {
          await this.destroySession(session.threadSessionKey, 'paused-ttl');
        }
      } catch (error) {
        logger.error({ error }, 'Runtime cleanup loop failed');
      }
    }, runtimeConfig.cleanupIntervalMs);
  }

  stopCleanupLoop(): void {
    if (!this.cleanupHandle) {
      return;
    }
    clearInterval(this.cleanupHandle);
    this.cleanupHandle = null;
  }

  async getActiveSessionCount(): Promise<number> {
    return (await listSessionsByStatus('active')).length;
  }
}

export const sandboxRuntimeManager = new SandboxRuntimeManager();
