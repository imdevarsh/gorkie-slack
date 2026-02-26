import type { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '~/config';
import { env } from '~/env';
import logger from '~/lib/logger';
import type { PtyLike } from '~/types/sandbox/rpc';
import { PiRpcClient } from './client';

const PTY_COLS = 220;
const PTY_ROWS = 24;
const PTY_TERM = 'dumb';

export async function boot(
  sandbox: Sandbox,
  sessionId?: string
): Promise<PiRpcClient> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let client: PiRpcClient | null = null;

  const terminal = await sandbox.pty.create({
    cols: PTY_COLS,
    rows: PTY_ROWS,
    cwd: config.runtime.workdir,
    envs: {
      HACKCLUB_API_KEY: env.HACKCLUB_API_KEY,
      HOME: config.runtime.workdir,
      TERM: PTY_TERM,
    },
    timeoutMs: 0,
    onData: (data: Uint8Array) => {
      if (!client) {
        return;
      }
      client.handleStdout(decoder.decode(data, { stream: true }));
    },
  });

  const pty: PtyLike = {
    sendInput: (data) =>
      sandbox.pty.sendInput(terminal.pid, encoder.encode(data)),
    kill: () => terminal.kill(),
    disconnect: () => terminal.disconnect(),
  };

  client = new PiRpcClient(pty);

  const piClient = client;
  terminal
    .wait()
    .then((result) => piClient.handleProcessExit(result))
    .catch((error: unknown) => {
      const exitCode = (error as { exitCode?: number }).exitCode;
      piClient.handleProcessExit({ exitCode });
    });

  const piCmd = sessionId
    ? `pi --mode rpc --session ${sessionId}`
    : 'pi --mode rpc';
  await pty.sendInput(`stty -echo; exec ${piCmd}\n`);
  await client.waitUntilReady();

  logger.debug({ sessionId }, '[pi-rpc] Pi process started');
  return client;
}
