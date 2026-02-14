import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Sandbox } from '@vercel/sandbox';
import logger from '~/lib/logger';
import { sandboxPath } from './utils';

const SANDBOX_TOOLS_DIR = path.join(process.cwd(), 'sandbox/agent/bin');

export interface SandboxToolFile {
  path: string;
  content: Buffer;
}

export async function makeFolders(instance: Sandbox): Promise<void> {
  await instance
    .runCommand({
      cmd: 'mkdir',
      args: [
        '-p',
        sandboxPath('attachments'),
        sandboxPath('agent/turns'),
        sandboxPath('agent/bin'),
        sandboxPath('output'),
      ],
    })
    .catch((error: unknown) => {
      logger.warn({ error }, '[sandbox] Failed to create directories');
    });
}

export async function installTools(instance: Sandbox): Promise<void> {
  try {
    const files = await readToolFiles();

    if (files.length === 0) {
      throw new Error('No sandbox bin files found in sandbox/agent/bin');
    }

    await instance.writeFiles(files);
  } catch (error) {
    logger.warn({ error }, '[sandbox] Failed to install sandbox tools');
  }
}

export function readToolFiles(): Promise<SandboxToolFile[]> {
  return readAllFiles(SANDBOX_TOOLS_DIR);
}

export async function toolsDigest(): Promise<string> {
  const files = await readToolFiles();
  const hash = createHash('sha256');

  for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(file.content);
    hash.update('\0');
  }

  return hash.digest('hex');
}

async function readAllFiles(rootDir: string): Promise<SandboxToolFile[]> {
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
