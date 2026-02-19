import { readFile } from 'node:fs/promises';
import type { Sandbox } from '@daytonaio/sdk';
import { sandbox as sandboxConfig } from '~/config';

export interface SandboxBootstrapFile {
  path: string;
  content: string;
}

function readTemplate(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

export async function buildConfig(prompt: string): Promise<{
  paths: string[];
  files: SandboxBootstrapFile[];
}> {
  const piDir = `${sandboxConfig.runtime.workdir}/.pi`;
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
    await sandbox.fs.createFolder(path, '700').catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('already exists')
      ) {
        return;
      }
      throw error;
    });
    await sandbox.fs.setFilePermissions(path, { mode: '700' });
  }

  for (const file of bootstrap.files) {
    await sandbox.fs.uploadFile(Buffer.from(file.content, 'utf8'), file.path);
    await sandbox.fs.setFilePermissions(file.path, { mode: '600' });
  }
}
