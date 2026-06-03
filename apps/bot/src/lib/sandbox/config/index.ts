import { readFile } from 'node:fs/promises';
import type { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '@/config';
import { env } from '@/env';

export async function configureAgent(
  sandbox: Sandbox,
  prompt: string
): Promise<void> {
  const { model, retry, runtime } = config;
  const piDir = `${runtime.workdir}/.pi`;
  const agentDir = `${piDir}/agent`;
  const extensionsDir = `${piDir}/extensions`;

  const toolsExtension = await readFile(
    new URL('./extensions/tools.ts', import.meta.url),
    'utf8'
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
      content: JSON.stringify(
        {
          providers: {
            [model.provider]: {
              baseUrl: `${env.SERVER_BASE_URL}/provider/${model.provider}`,
              api: model.api,
              apiKey: 'GORKIE_SESSION_TOKEN',
              authHeader: true,
              models: [{ id: model.modelId }],
            },
          },
        },
        null,
        2
      ),
    },
    {
      path: `${agentDir}/auth.json`,
      content: JSON.stringify(
        {
          [model.provider]: {
            type: 'api_key',
            key: 'GORKIE_SESSION_TOKEN',
          },
        },
        null,
        2
      ),
    },
    { path: `${extensionsDir}/tools.ts`, content: toolsExtension },
  ]) {
    await sandbox.files.write(file.path, file.content);
  }
}
