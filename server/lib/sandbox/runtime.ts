import type { Sandbox } from '@daytonaio/sdk';
import { SandboxAgent, type Session } from 'sandbox-agent';
import { sandbox as config } from '~/config';
import { env } from '~/env';
import { type PreviewAccess, waitForHealth } from './client';

export async function startServer(sandbox: Sandbox): Promise<void> {
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

export async function preview(sandbox: Sandbox): Promise<PreviewAccess> {
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

export async function boot(
  sandbox: Sandbox
): Promise<{ sdk: SandboxAgent; access: PreviewAccess }> {
  await startServer(sandbox);
  const access = await preview(sandbox);
  await waitForHealth(access, config.timeouts.healthMs);
  const sdk = await connect(access);
  return { sdk, access };
}

export function connect(access: PreviewAccess): Promise<SandboxAgent> {
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

export async function ensureSession(
  sdk: SandboxAgent,
  sessionId: string
): Promise<Session> {
  const resumed = await sdk.resumeSession(sessionId).catch(() => null);
  if (resumed) {
    return resumed;
  }

  return createSession(sdk, sessionId);
}

export function createSession(
  sdk: SandboxAgent,
  sessionId: string
): Promise<Session> {
  return sdk.createSession({
    id: sessionId,
    agent: 'opencode',
    sessionInit: {
      cwd: config.runtime.workdir,
      mcpServers: [],
    },
  });
}
