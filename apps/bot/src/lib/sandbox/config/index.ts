import { readFile, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import type { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '@/config';
import { env } from '@/env';
import type { SandboxBootstrapFile } from '@/types';

const readFileAsync = promisify(readFile);

function readTemplate(path: string): Promise<string> {
  return readFileAsync(new URL(path, import.meta.url), 'utf8');
}

function buildProxyAuthJson(): string {
  const { provider } = config.model;
  return JSON.stringify(
    { [provider]: { type: 'api_key', key: 'GORKIE_SESSION_TOKEN' } },
    null,
    2
  );
}

function buildModelsJson(): string {
  const { provider } = config.model;
  const staticModels = JSON.parse(
    readFileSync(new URL('./models.json', import.meta.url), 'utf8').toString()
  ) as { providers: Record<string, unknown> };

  const existing = staticModels.providers[provider] ?? {};
  return JSON.stringify(
    {
      providers: {
        [provider]: {
          ...existing,
          baseUrl: `${env.PROXY_BASE_URL}/provider/${provider}`,
          apiKey: 'GORKIE_SESSION_TOKEN',
          authHeader: true,
        },
      },
    },
    null,
    2
  );
}

export async function buildConfig(prompt: string): Promise<{
  paths: string[];
  files: SandboxBootstrapFile[];
}> {
  const piDir = `${config.runtime.workdir}/.pi`;
  const agentDir = `${piDir}/agent`;
  const extensionsDir = `${piDir}/extensions`;

  const [settings, models, auth, toolsExtension] = await Promise.all([
    readTemplate('./settings.json'),
    Promise.resolve(buildModelsJson()),
    Promise.resolve(buildProxyAuthJson()),
    readTemplate('./extensions/tools.ts'),
  ]);

  return {
    paths: [piDir, agentDir, extensionsDir],
    files: [
      { path: `${piDir}/SYSTEM.md`, content: prompt },
      { path: `${agentDir}/settings.json`, content: settings },
      { path: `${agentDir}/models.json`, content: models },
      { path: `${agentDir}/auth.json`, content: auth },
      { path: `${extensionsDir}/tools.ts`, content: toolsExtension },
    ],
  };
}

export async function configureAgent(
  sandbox: Sandbox,
  prompt: string
): Promise<void> {
  const bootstrap = await buildConfig(prompt);

  for (const path of bootstrap.paths) {
    await sandbox.files.makeDir(path).catch(() => undefined);
  }

  for (const file of bootstrap.files) {
    await sandbox.files.write(file.path, file.content);
  }
}
