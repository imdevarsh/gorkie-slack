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
    const repoDir = path.join(process.cwd(), 'sandbox');
    const files = await readAllFiles(repoDir);

    if (files.length === 0) {
      throw new Error('No sandbox files found in sandbox/');
    }

    await instance.writeFiles(files);
  } catch (error) {
    logger.warn({ error }, 'Sandbox bin install failed');
  }
}

async function readAllFiles(
  rootDir: string
): Promise<Array<{ path: string; content: Buffer }>> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        return readAllFiles(fullPath);
      }
      if (!entry.isFile()) {
        return [];
      }
      const content = await readFile(fullPath);
      const relative = path.relative(
        path.join(process.cwd(), 'sandbox'),
        fullPath
      );
      return [{ path: relative, content }];
    })
  );
  return files.flat();
}
