import { readFile, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import type { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '~/config';
import type { SandboxBootstrapFile } from '~/types';

const readFileAsync = promisify(readFile);

function readTemplate(path: string): Promise<string> {
  return readFileAsync(new URL(path, import.meta.url), 'utf8');
}

function buildModelsJson(proxyBaseUrl: string): string {
  const staticModels = JSON.parse(
    readFileSync(new URL('./models.json', import.meta.url), 'utf8').toString()
  ) as {
    providers: Record<
      string,
      {
        models?: unknown[];
        baseUrl?: string;
        api?: string;
        authHeader?: boolean;
      }
    >;
  };

  const providers: Record<string, unknown> = {};
  const seen = new Set<string>();

  for (const { provider } of config.modelChain) {
    if (seen.has(provider)) {
      continue;
    }
    seen.add(provider);
    const existing = staticModels.providers[provider] ?? {};
    providers[provider] = {
      ...existing,
      baseUrl: `${proxyBaseUrl}/${provider}`,
      apiKey: 'GORKIE_SESSION_TOKEN',
      authHeader: true,
    };
  }

  return JSON.stringify({ providers }, null, 2);
}

export async function buildConfig(
  prompt: string,
  proxyBaseUrl?: string
): Promise<{
  paths: string[];
  files: SandboxBootstrapFile[];
}> {
  const piDir = `${config.runtime.workdir}/.pi`;
  const agentDir = `${piDir}/agent`;
  const extensionsDir = `${piDir}/extensions`;

  const [settings, models, auth, toolsExtension] = await Promise.all([
    readTemplate('./settings.json'),
    proxyBaseUrl
      ? Promise.resolve(buildModelsJson(proxyBaseUrl))
      : readTemplate('./models.json'),
    readTemplate('./auth.json'),
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
  prompt: string,
  proxyBaseUrl?: string
): Promise<void> {
  const bootstrap = await buildConfig(prompt, proxyBaseUrl);

  for (const path of bootstrap.paths) {
    await sandbox.files.makeDir(path).catch(() => undefined);
  }

  for (const file of bootstrap.files) {
    await sandbox.files.write(file.path, file.content);
  }
}
