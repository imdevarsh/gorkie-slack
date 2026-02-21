import type { Sandbox } from '@daytonaio/sdk';
import { SandboxAgent, type Session } from 'sandbox-agent';
import { sandbox as config } from '~/config';
import { env } from '~/env';
import logger from '../logger';
import { type PreviewAccess, waitForHealth } from './client';
import { sessionPersist } from './persist';

const SERVER_ARGS = `--no-token --host 0.0.0.0 --port ${config.runtime.agentPort}`;
const SERVER_MATCH = `sandbox-agent server .*--port ${config.runtime.agentPort}`;

async function killServer(sandbox: Sandbox): Promise<void> {
  await sandbox.process
    .executeCommand(
      `pkill -f '${SERVER_MATCH}' || true`,
      config.runtime.workdir,
      {
        HACKCLUB_API_KEY: env.HACKCLUB_API_KEY,
      }
    )
    .catch(() => null);
}

async function startServer(sandbox: Sandbox): Promise<void> {
  const result = await sandbox.process.executeCommand(
    `nohup env sandbox-agent server ${SERVER_ARGS} >/tmp/sandbox-agent.log 2>&1 &`,
    config.runtime.workdir,
    {
      HACKCLUB_API_KEY: env.HACKCLUB_API_KEY,
    },
    0
  );

  // exitCode is always 0 for backgrounded processes; actual startup
  // verification happens via the health check in boot().
  if (result.exitCode !== 0) {
    throw new Error(`Failed to launch sandbox-agent server: ${result.result}`);
  }
}

async function getPreviewAccess(sandbox: Sandbox): Promise<PreviewAccess> {
  const preview = await sandbox.getPreviewLink(config.runtime.agentPort);
  return {
    baseUrl: preview.url,
    previewToken: preview.token ?? null,
  };
}

async function isHealthy(access: PreviewAccess): Promise<boolean> {
  const headers = new Headers();
  if (access.previewToken) {
    headers.set('x-daytona-preview-token', access.previewToken);
  }

  const response = await fetch(`${access.baseUrl}/v1/health`, {
    method: 'GET',
    headers,
  }).catch(() => null);

  return response?.ok === true;
}

export async function boot(
  sandbox: Sandbox
): Promise<{ sdk: SandboxAgent; access: PreviewAccess }> {
  const access = await getPreviewAccess(sandbox);

  if (!(await isHealthy(access))) {
    await killServer(sandbox);

    try {
      await startServer(sandbox);
      await waitForHealth(access, config.timeouts.healthMs);
    } catch {
      await killServer(sandbox);
      await startServer(sandbox);
      await waitForHealth(access, config.timeouts.healthMs);
    }
  }

  const sdk = await connect(access);

  return { sdk, access };
}

export function connect(access: PreviewAccess): Promise<SandboxAgent> {
  return SandboxAgent.connect({
    baseUrl: access.baseUrl,
    persist: sessionPersist,
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
  const resumed = await sdk.resumeSession(sessionId).catch((error: unknown) => {
    logger.error({ sessionId, err: error }, 'Failed to resume session');
  });
  if (resumed) {
    return resumed;
  }

  return createSession(sdk);
}

export function createSession(sdk: SandboxAgent): Promise<Session> {
  return sdk.createSession({
    agent: 'pi',
    sessionInit: {
      cwd: config.runtime.workdir,
      mcpServers: [],
    },
  });
}
