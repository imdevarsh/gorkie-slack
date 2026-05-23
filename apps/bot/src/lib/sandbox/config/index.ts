import { readFile } from 'node:fs/promises';
import type { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '@/config';
import { env } from '@/env';

export async function configureAgent(
  sandbox: Sandbox,
  prompt: string
): Promise<void> {
  const { model, modelChain, retry, runtime } = config;
  const piDir = `${runtime.workdir}/.pi`;
  const agentDir = `${piDir}/agent`;
  const extensionsDir = `${piDir}/extensions`;

  const toolsExtension = await readFile(
    new URL('./extensions/tools.ts', import.meta.url),
    'utf8'
  );

  // Derive unique providers and their model lists from modelChain
  const providerModels = new Map<string, string[]>();
  for (const entry of modelChain) {
    const models = providerModels.get(entry.provider) ?? [];
    if (!models.includes(entry.modelId)) {
      models.push(entry.modelId);
      providerModels.set(entry.provider, models);
    }
  }

  const providersMap = Object.fromEntries(
    [...providerModels.entries()].map(([provider, models]) => [
      provider,
      {
        baseUrl: new URL(
          `/provider/${provider}`,
          env.PROXY_BASE_URL
        ).toString(),
        api: model.api,
        apiKey: 'GORKIE_SESSION_TOKEN',
        authHeader: true,
        models: models.map((id) => ({ id })),
      },
    ])
  );

  const authMap = Object.fromEntries(
    [...providerModels.keys()].map((provider) => [
      provider,
      { type: 'api_key', key: 'GORKIE_SESSION_TOKEN' },
    ])
  );

  for (const path of [piDir, agentDir, extensionsDir]) {
    await sandbox.files.makeDir(path).catch(() => undefined);
  }

  for (const file of [
    { path: `${piDir}/SYSTEM.md`, content: prompt },
    {
      path: `${agentDir}/settings.json`,
      content: JSON.stringify(
        {
          defaultProvider: model.provider,
          defaultModel: model.modelId,
          retry,
        },
        null,
        2
      ),
    },
    {
      path: `${agentDir}/models.json`,
      content: JSON.stringify({ providers: providersMap }, null, 2),
    },
    {
      path: `${agentDir}/auth.json`,
      content: JSON.stringify(authMap, null, 2),
    },
    { path: `${extensionsDir}/tools.ts`, content: toolsExtension },
  ]) {
    await sandbox.files.write(file.path, file.content);
  }
}
