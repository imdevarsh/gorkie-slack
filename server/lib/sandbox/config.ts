import type { Sandbox } from '@daytonaio/sdk';
import { sandbox as sandboxConfig } from '~/config';

export interface SandboxBootstrapFile {
  path: string;
  content: string;
}

export function buildConfig(prompt: string): {
  paths: string[];
  files: SandboxBootstrapFile[];
} {
  const piDir = `${sandboxConfig.runtime.workdir}/.pi`;
  const agentDir = `${piDir}/agent`;

  const settings = JSON.stringify(
    {
      defaultProvider: 'openrouter',
      defaultModel: 'google/gemini-3-flash-preview',
    },
    null,
    2
  );

  const models = JSON.stringify(
    {
      providers: {
        openrouter: {
          baseUrl: 'https://ai.hackclub.com/proxy/v1',
          api: 'openai-completions',
          apiKey: 'HACKCLUB_API_KEY',
          authHeader: true,
          models: [
            { id: 'google/gemini-3-flash-preview' },
            { id: 'openai/gpt-5-mini' },
          ],
        },
      },
    },
    null,
    2
  );

  return {
    paths: [piDir, agentDir],
    files: [
      { path: `${piDir}/SYSTEM.md`, content: prompt },
      { path: `${agentDir}/settings.json`, content: settings },
      { path: `${agentDir}/models.json`, content: models },
    ],
  };
}

export async function configureAgent(
  sandbox: Sandbox,
  prompt: string
): Promise<void> {
  const bootstrap = buildConfig(prompt);
  await sandbox.process.executeCommand(
    `mkdir -p ${bootstrap.paths.map((path) => `"${path}"`).join(' ')}`,
    sandboxConfig.runtime.workdir
  );
  for (const file of bootstrap.files) {
    await sandbox.fs.uploadFile(Buffer.from(file.content, 'utf8'), file.path);
  }
}
