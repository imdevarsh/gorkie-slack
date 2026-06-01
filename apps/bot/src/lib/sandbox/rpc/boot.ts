import type { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '@/config';
import { env } from '@/env';
import logger from '@/lib/logger';
import type { PtyLike } from '@/types/sandbox/rpc';
import { PiRpcClient } from './client';

export async function boot({
  sandbox,
  sessionId,
  sessionToken,
}: {
  sandbox: Sandbox;
  sessionId?: string;
  sessionToken: string;
}): Promise<PiRpcClient> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let client: PiRpcClient | null = null;

  const terminal = await sandbox.pty.create({
    cols: 220,
    rows: 24,
    cwd: config.runtime.workdir,
    envs: {
      GORKIE_SESSION_TOKEN: sessionToken,
      AGENTMAIL_API_KEY: env.AGENTMAIL_API_KEY,
      HOME: config.runtime.workdir,
      TERM: 'dumb',
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
