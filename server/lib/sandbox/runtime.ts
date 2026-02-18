import type { Sandbox } from '@daytonaio/sdk';
import { SandboxAgent, type Session } from 'sandbox-agent';
import { sandbox as config } from '~/config';
import { env } from '~/env';
import { type PreviewAccess, waitForHealth } from './client';
import { mcpServer, SANDBOX_MCP_DIR, SANDBOX_MCP_SERVER_PATH } from './mcp';

const SERVER_ARGS = `--no-token --host 0.0.0.0 --port ${config.runtime.agentPort}`;

async function startServer(sandbox: Sandbox): Promise<void> {
  const result = await sandbox.process.executeCommand(
    `nohup sandbox-agent server ${SERVER_ARGS} >/tmp/sandbox-agent.log 2>&1 &`,
    config.runtime.workdir,
    {
      HACKCLUB_API_KEY: env.HACKCLUB_API_KEY
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

async function setupMCPServer(sdk: SandboxAgent): Promise<void> {
  const server = await mcpServer();
  await sdk.mkdirFs({ path: SANDBOX_MCP_DIR }).catch((error: unknown) => {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('already exists')
    ) {
      return;
    }
    throw error;
  });
  await sdk.writeFsFile({ path: SANDBOX_MCP_SERVER_PATH }, server);
  await sdk.setMcpConfig(
    {
      directory: config.runtime.workdir,
      mcpName: 'customTools',
    },
    {
      type: 'local',
      command: 'node',
      args: [SANDBOX_MCP_SERVER_PATH],
      env: {},
      enabled: true,
    }
  );
}

export async function boot(
  sandbox: Sandbox
): Promise<{ sdk: SandboxAgent; access: PreviewAccess }> {
  const access = await getPreviewAccess(sandbox);

  if (!(await isHealthy(access))) {
    await startServer(sandbox);
    await waitForHealth(access, config.timeouts.healthMs);
  }

  const sdk = await connect(access);
  await setupMCPServer(sdk);

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
    const servers = resumed.toRecord().sessionInit?.mcpServers;
    const hasCustomTools = Array.isArray(servers)
      ? servers.some(
          (server) =>
            server.name === 'customTools' &&
            'command' in server &&
            server.command === 'node' &&
            'args' in server &&
            server.args.includes(SANDBOX_MCP_SERVER_PATH)
        )
      : false;

    if (hasCustomTools) {
      return resumed;
    }

    await sdk.destroySession(sessionId).catch(() => {});
    return createSession(sdk, sessionId);
  }

  return createSession(sdk, sessionId);
}

export function createSession(
  sdk: SandboxAgent,
  sessionId: string
): Promise<Session> {
  return sdk.createSession({
    id: sessionId,
    agent: 'pi',
    sessionInit: {
      cwd: config.runtime.workdir,
      mcpServers: [
        {
          name: 'customTools',
          command: 'node',
          args: [SANDBOX_MCP_SERVER_PATH],
          env: [],
        },
      ],
    },
  });
}
