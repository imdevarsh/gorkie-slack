import { readFile } from 'node:fs/promises';
import type { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '@/config';
import { env } from '@/env';

function buildProviderConfig(models: typeof config.models, api: string) {
  const providerModels = new Map<string, string[]>();
  for (const entry of models) {
    const ids = providerModels.get(entry.provider) ?? [];
    if (!ids.includes(entry.modelId)) {
      ids.push(entry.modelId);
      providerModels.set(entry.provider, ids);
    }
  }

  const providers = Object.fromEntries(
    [...providerModels.entries()].map(([provider, ids]) => [
      provider,
      {
        baseUrl: new URL(
          `/provider/${provider}`,
          env.PROXY_BASE_URL
        ).toString(),
        api,
        apiKey: 'GORKIE_SESSION_TOKEN',
        authHeader: true,
        models: ids.map((id) => ({ id })),
      },
    ])
  );

  const auth = Object.fromEntries(
    [...providerModels.keys()].map((provider) => [
      provider,
      { type: 'api_key', key: 'GORKIE_SESSION_TOKEN' },
    ])
  );

  return { providers, auth };
}

export async function configureAgent(
  sandbox: Sandbox,
  prompt: string
): Promise<void> {
  const { models, modelApi, retry, runtime } = config;

  if (models.length === 0) {
    throw new Error('sandbox.models must not be empty');
  }

  const defaultModel = models[0] as NonNullable<(typeof models)[number]>;
  const piDir = `${runtime.workdir}/.pi`;
  const agentDir = `${piDir}/agent`;
  const extensionsDir = `${piDir}/extensions`;
  const fallbackDir = `${extensionsDir}/model-fallback`;

  const [toolsExtension, fallbackExtension, fallbackRetry] = await Promise.all([
    readFile(new URL('./extensions/tools.ts', import.meta.url), 'utf8'),
    readFile(
      new URL('./extensions/model-fallback/index.ts', import.meta.url),
      'utf8'
    ),
    readFile(
      new URL('./extensions/model-fallback/retry.ts', import.meta.url),
      'utf8'
    ),
  ]);

  const { providers, auth } = buildProviderConfig(models, modelApi);

  for (const path of [piDir, agentDir, extensionsDir, fallbackDir]) {
    await sandbox.files.makeDir(path).catch(() => undefined);
  }

  for (const file of [
    { path: `${piDir}/SYSTEM.md`, content: prompt },
    {
      path: `${agentDir}/settings.json`,
      content: JSON.stringify(
        {
          defaultProvider: defaultModel.provider,
          defaultModel: defaultModel.modelId,
          fallbackModels: models.map(
            ({ provider, modelId }) => `${provider}/${modelId}`
          ),
          retry: {
            enabled: true,
            maxRetries: Math.max(models.length - 1, 0),
            baseDelayMs: retry.baseDelay,
            provider: {
              timeoutMs: retry.request,
              maxRetries: 0,
            },
          },
        },
        null,
        2
      ),
    },
    {
      path: `${agentDir}/models.json`,
      content: JSON.stringify({ providers }, null, 2),
    },
    {
      path: `${agentDir}/auth.json`,
      content: JSON.stringify(auth, null, 2),
    },
    { path: `${extensionsDir}/tools.ts`, content: toolsExtension },
    {
      path: `${fallbackDir}/index.ts`,
      content: fallbackExtension,
    },
    {
      path: `${fallbackDir}/retry.ts`,
      content: fallbackRetry,
    },
  ]) {
    await sandbox.files.write(file.path, file.content);
  }
}
