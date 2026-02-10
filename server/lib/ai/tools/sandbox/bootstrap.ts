import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Sandbox } from '@vercel/sandbox';
import logger from '~/lib/logger';

export async function makeFolders(instance: Sandbox): Promise<void> {
  await instance
    .runCommand({
      cmd: 'mkdir',
      args: ['-p', 'agent/turns', 'agent/bin', 'output'],
    })
    .catch((error: unknown) => {
      logger.warn({ error }, 'Sandbox dir setup failed');
    });
}

export async function installUtils(instance: Sandbox): Promise<void> {
  try {
    const repoDir = path.join(process.cwd(), 'sandbox', 'agent', 'bin');
    const entries = await readdir(repoDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.py'))
        .map(async (entry) => {
          const filePath = path.join(repoDir, entry.name);
          const content = await readFile(filePath);
          return {
            path: `agent/bin/${entry.name}`,
            content,
          };
        })
    );

    if (files.length === 0) {
      throw new Error('No sandbox bin files found in sandbox/agent/bin');
    }

    await instance.writeFiles(files);
  } catch (error) {
    logger.warn({ error }, 'Sandbox bin install failed');
  }
}
