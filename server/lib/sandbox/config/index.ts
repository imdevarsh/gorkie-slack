import { readFile } from 'node:fs/promises';
import type { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '~/config';

export interface SandboxBootstrapFile {
  content: string;
  path: string;
}

function readTemplate(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), 'utf8');
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
    readTemplate('./models.json'),
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
  prompt: string
): Promise<void> {
  const bootstrap = await buildConfig(prompt);

  for (const path of bootstrap.paths) {
    await sandbox.files.makeDir(path).catch(() => {
      // Directory may already exist.
    });
  }

  for (const file of bootstrap.files) {
    await sandbox.files.write(file.path, file.content);
  }
}
