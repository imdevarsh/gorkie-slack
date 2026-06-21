import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import type {
  Experimental_SandboxProcess,
  Experimental_SandboxSession,
} from '@ai-sdk/provider-utils';
import { CommandExitError, type Sandbox } from '@e2b/code-interpreter';
import { sandboxConfig as config } from './config';
import { collectStream, streamFromBytes, streamFromText } from './stream';

export function isMissingSandboxError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('not found') ||
    message.includes('404') ||
    message.includes('does not exist')
  );
}

function commandTimeoutMs(): number {
  return Math.max(config.timeoutMs, config.executionTimeoutMs + 60_000);
}

async function waitForBackgroundCommand({
  abortSignal,
  handle,
  stderr,
  stdout,
}: {
  abortSignal?: AbortSignal;
  handle: { wait: () => Promise<{ exitCode: number }> };
  stderr: ReturnType<typeof streamFromText>;
  stdout: ReturnType<typeof streamFromText>;
}): Promise<{ exitCode: number }> {
  try {
    const result = await handle.wait();
    if (abortSignal?.aborted) {
      throw abortSignal?.reason ?? new DOMException('Aborted', 'AbortError');
    }
    return { exitCode: result.exitCode };
  } catch (error) {
    if (error instanceof CommandExitError) {
      if (abortSignal?.aborted) {
        throw abortSignal?.reason ?? new DOMException('Aborted', 'AbortError');
      }
      return { exitCode: error.exitCode };
    }
    stdout.error(error);
    stderr.error(error);
    throw error;
  } finally {
    stdout.close();
    stderr.close();
  }
}

class E2BSandboxSession implements Experimental_SandboxSession {
  protected readonly env: Record<string, string>;
  protected readonly sandbox: Sandbox;

  constructor({
    env = {},
    sandbox,
  }: {
    env?: Record<string, string>;
    sandbox: Sandbox;
  }) {
    this.env = env;
    this.sandbox = sandbox;
  }

  protected extendTimeout(timeoutMs = config.timeoutMs): Promise<void> {
    return this.sandbox.setTimeout(timeoutMs);
  }

  get description(): string {
    return [
      `E2B sandbox ${this.sandbox.sandboxId}.`,
      `Default working directory: ${config.workdir}.`,
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
    return bytes ? streamFromBytes(bytes) : null;
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
      .read(path, {
        format: 'bytes',
        ...(abortSignal ? { signal: abortSignal } : {}),
      })
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

    await this.sandbox.files.write(
      path,
      new Blob([content]),
      abortSignal ? { signal: abortSignal } : {}
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
    await this.extendTimeout(commandTimeoutMs());

    try {
      const result = await this.sandbox.commands.run(command, {
        cwd: workingDirectory,
        envs: { ...this.env, ...env },
        signal: abortSignal,
        timeoutMs: config.executionTimeoutMs,
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
    await this.extendTimeout(commandTimeoutMs());

    const stdout = streamFromText();
    const stderr = streamFromText();
    const handle = await this.sandbox.commands.run(command, {
      background: true,
      cwd: workingDirectory,
      envs: { ...this.env, ...env },
      onStderr: stderr.write,
      onStdout: stdout.write,
      signal: abortSignal,
      timeoutMs: 0,
    });
    const abort = () => {
      handle
        .kill()
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          stderr.write(`Failed to kill sandbox process: ${message}\n`);
        })
        .finally(() => {
          stdout.close();
          stderr.close();
        });
    };
    abortSignal?.addEventListener('abort', abort, { once: true });

    return {
      pid: handle.pid,
      stderr: stderr.readable,
      stdout: stdout.readable,
      kill: () => handle.kill().then(() => undefined),
      wait: async () => {
        try {
          return await waitForBackgroundCommand({
            abortSignal,
            handle,
            stderr,
            stdout,
          });
        } finally {
          abortSignal?.removeEventListener('abort', abort);
        }
      },
    };
  }
}

export class E2BNetworkSandboxSession
  extends E2BSandboxSession
  implements HarnessV1NetworkSandboxSession
{
  readonly defaultWorkingDirectory = config.workdir;
  readonly id: string;
  readonly ports: readonly number[] = [];

  constructor({
    env,
    sandbox,
  }: {
    env?: Record<string, string>;
    sandbox: Sandbox;
  }) {
    super({ env, sandbox });
    this.id = sandbox.sandboxId;
  }

  restricted(): Experimental_SandboxSession {
    return new E2BSandboxSession({ env: this.env, sandbox: this.sandbox });
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

  stop = (): Promise<void> => this.sandbox.pause().then(() => undefined);

  destroy = (): Promise<void> => this.sandbox.kill().then(() => undefined);
}
