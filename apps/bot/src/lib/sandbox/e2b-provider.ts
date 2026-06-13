import nodePath from 'node:path/posix';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import type {
  Experimental_SandboxProcess,
  Experimental_SandboxSession,
} from '@ai-sdk/provider-utils';
import { CommandExitError, Sandbox } from '@e2b/code-interpreter';
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

interface E2BSandboxProviderSettings {
  template: string;
}

const E2B_PROVIDER_ID = 'e2b';

function isMissingSandboxError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('not found') ||
    message.includes('404') ||
    message.includes('does not exist')
  );
}

function toRequestOptions(abortSignal?: AbortSignal) {
  return abortSignal ? { signal: abortSignal } : {};
}

function parentDirectory(path: string): string | null {
  const directory = nodePath.dirname(path);
  return directory && directory !== '.' && directory !== '/' ? directory : null;
}

function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function collectStream(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function streamFromText(): {
  readable: ReadableStream<Uint8Array>;
  write: (chunk: string) => void;
  close: () => void;
  error: (error: unknown) => void;
} {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const pending: Uint8Array[] = [];
  let closed = false;

  const readable = new ReadableStream<Uint8Array>({
    start: (nextController) => {
      controller = nextController;
      for (const chunk of pending.splice(0)) {
        controller.enqueue(chunk);
      }
      if (closed) {
        controller.close();
      }
    },
  });

  return {
    readable,
    write: (chunk) => {
      if (closed) {
        return;
      }
      const encoded = encoder.encode(chunk);
      if (controller) {
        controller.enqueue(encoded);
        return;
      }
      pending.push(encoded);
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      controller?.close();
    },
    error: (error) => {
      if (closed) {
        return;
      }
      closed = true;
      controller?.error(error);
    },
  };
}

class E2BSandboxSession implements Experimental_SandboxSession {
  protected readonly sandbox: Sandbox;

  constructor(sandbox: Sandbox) {
    this.sandbox = sandbox;
  }

  get description(): string {
    return [
      `E2B sandbox ${this.sandbox.sandboxId}.`,
      `Default working directory: ${config.runtime.workdir}.`,
    ].join('\n');
  }

  async readFile({
    abortSignal,
    path,
  }: {
    abortSignal?: AbortSignal;
    path: string;
  }): Promise<ReadableStream<Uint8Array> | null> {
    const bytes = await this.readBinaryFile({ abortSignal, path });
    return bytes ? bytesToStream(bytes) : null;
  }

  readBinaryFile({
    abortSignal,
    path,
  }: {
    abortSignal?: AbortSignal;
    path: string;
  }): Promise<Uint8Array | null> {
    abortSignal?.throwIfAborted();

    return this.sandbox.files
      .read(path, { format: 'bytes', ...toRequestOptions(abortSignal) })
      .catch((error: unknown) => {
        if (isMissingSandboxError(error)) {
          return null;
        }
        throw error;
      });
  }

  async readTextFile({
    abortSignal,
    encoding = 'utf-8',
    endLine,
    path,
    startLine = 1,
  }: {
    abortSignal?: AbortSignal;
    encoding?: string;
    endLine?: number;
    path: string;
    startLine?: number;
  }): Promise<string | null> {
    if (encoding !== 'utf-8') {
      throw new Error(`Unsupported text encoding: ${encoding}`);
    }

    const content = await this.readBinaryFile({ abortSignal, path });
    if (!content) {
      return null;
    }

    const text = new TextDecoder().decode(content);
    if (startLine <= 1 && endLine === undefined) {
      return text;
    }

    return text
      .split('\n')
      .slice(Math.max(startLine - 1, 0), endLine)
      .join('\n');
  }

  async writeFile({
    abortSignal,
    content,
    path,
  }: {
    abortSignal?: AbortSignal;
    content: ReadableStream<Uint8Array>;
    path: string;
  }): Promise<void> {
    const bytes = await collectStream(content);
    await this.writeBinaryFile({ abortSignal, content: bytes, path });
  }

  async writeBinaryFile({
    abortSignal,
    content,
    path,
  }: {
    abortSignal?: AbortSignal;
    content: Uint8Array;
    path: string;
  }): Promise<void> {
    abortSignal?.throwIfAborted();

    const directory = parentDirectory(path);
    if (directory) {
      await this.sandbox.files.makeDir(directory).catch(() => undefined);
    }

    await this.sandbox.files.write(
      path,
      new Blob([content]),
      toRequestOptions(abortSignal)
    );
  }

  async writeTextFile({
    abortSignal,
    content,
    encoding = 'utf-8',
    path,
  }: {
    abortSignal?: AbortSignal;
    content: string;
    encoding?: string;
    path: string;
  }): Promise<void> {
    if (encoding !== 'utf-8') {
      throw new Error(`Unsupported text encoding: ${encoding}`);
    }

    await this.writeBinaryFile({
      abortSignal,
      content: new TextEncoder().encode(content),
      path,
    });
  }

  async run({
    abortSignal,
    command,
    env,
    workingDirectory,
  }: {
    abortSignal?: AbortSignal;
    command: string;
    env?: Record<string, string>;
    workingDirectory?: string;
  }): Promise<{ exitCode: number; stderr: string; stdout: string }> {
    abortSignal?.throwIfAborted();

    try {
      const result = await this.sandbox.commands.run(command, {
        cwd: workingDirectory,
        envs: env,
        signal: abortSignal,
        timeoutMs: config.runtime.executionTimeoutMs,
      });
      return {
        exitCode: result.exitCode,
        stderr: result.stderr,
        stdout: result.stdout,
      };
    } catch (error) {
      if (error instanceof CommandExitError) {
        return {
          exitCode: error.exitCode,
          stderr: error.stderr,
          stdout: error.stdout,
        };
      }
      throw error;
    }
  }

  async spawn({
    abortSignal,
    command,
    env,
    workingDirectory,
  }: {
    abortSignal?: AbortSignal;
    command: string;
    env?: Record<string, string>;
    workingDirectory?: string;
  }): Promise<Experimental_SandboxProcess> {
    abortSignal?.throwIfAborted();

    const stdout = streamFromText();
    const stderr = streamFromText();
    const handle = await this.sandbox.commands.run(command, {
      background: true,
      cwd: workingDirectory,
      envs: env,
      onStderr: stderr.write,
      onStdout: stdout.write,
      signal: abortSignal,
      timeoutMs: 0,
    });
    const abort = () => {
      handle.kill().catch(() => undefined);
      stdout.close();
      stderr.close();
    };
    abortSignal?.addEventListener('abort', abort, { once: true });

    return {
      pid: handle.pid,
      stderr: stderr.readable,
      stdout: stdout.readable,
      kill: () => handle.kill().then(() => undefined),
      wait: async () => {
        try {
          const result = await handle.wait();
          if (abortSignal?.aborted) {
            throw (
              abortSignal.reason ?? new DOMException('Aborted', 'AbortError')
            );
          }
          return { exitCode: result.exitCode };
        } catch (error) {
          if (error instanceof CommandExitError) {
            if (abortSignal?.aborted) {
              throw (
                abortSignal.reason ?? new DOMException('Aborted', 'AbortError')
              );
            }
            return { exitCode: error.exitCode };
          }
          stdout.error(error);
          stderr.error(error);
          throw error;
        } finally {
          abortSignal?.removeEventListener('abort', abort);
          stdout.close();
          stderr.close();
        }
      },
    };
  }
}

class E2BNetworkSandboxSession
  extends E2BSandboxSession
  implements HarnessV1NetworkSandboxSession
{
  readonly defaultWorkingDirectory = config.runtime.workdir;
  readonly id: string;
  readonly ports: readonly number[] = [];

  constructor(sandbox: Sandbox) {
    super(sandbox);
    this.id = sandbox.sandboxId;
  }

  restricted(): Experimental_SandboxSession {
    return new E2BSandboxSession(this.sandbox);
  }

  getPortUrl = ({
    port,
    protocol = 'https',
  }: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<string> => {
    const urlProtocol = protocol === 'ws' ? 'wss' : protocol;
    return Promise.resolve(`${urlProtocol}://${this.sandbox.getHost(port)}`);
  };

  stop = (): Promise<void> => this.sandbox.betaPause().then(() => undefined);

  destroy = (): Promise<void> => this.sandbox.kill().then(() => undefined);
}

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
  } = {}): Promise<HarnessV1NetworkSandboxSession> => {
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
  }): Promise<HarnessV1NetworkSandboxSession> => {
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
