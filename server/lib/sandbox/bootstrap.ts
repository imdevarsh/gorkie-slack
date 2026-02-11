import type { Sandbox } from '@vercel/sandbox';
import logger from '~/lib/logger';

export async function makeFolders(instance: Sandbox): Promise<void> {
  await instance
    .runCommand({
      cmd: 'mkdir',
      args: ['-p', 'agent/turns', 'output'],
    })
    .catch((error: unknown) => {
      logger.warn({ error }, 'Sandbox dir setup failed');
    });
}

export async function installTools(instance: Sandbox): Promise<void> {
  const result = await instance
    .runCommand({
      cmd: 'sudo',
      args: ['dnf', 'install', '-y', 'ripgrep', 'fd-find'],
    })
    .catch((error: unknown) => {
      logger.warn({ error }, 'Sandbox tool install failed');
      return null;
    });

  if (result && result.exitCode !== 0) {
    const stderr = await result.stderr();
    logger.warn({ exitCode: result.exitCode, stderr }, 'dnf install failed');
  }
}
