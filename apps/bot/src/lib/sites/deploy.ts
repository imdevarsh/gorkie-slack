import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import type { SandboxContext } from '@repo/ai';
import logger from '@/lib/logger';
import { resolveWithin, siteRoot, sitesRoot } from './paths';

// Limits keep a single deploy from exhausting host disk or hanging on a huge
// build directory. Static sites are small; these are generous ceilings.
const MAX_FILES = 2000;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200 MB
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

type Session = SandboxContext['session'];

export type DeployResult =
  | { ok: true; fileCount: number; totalBytes: number }
  | { ok: false; error: string };

/** A rejected-by-default check on each relative path from the sandbox. */
function isSafeRelative(relative: string): boolean {
  if (!relative || relative.includes('\0') || nodePath.isAbsolute(relative)) {
    return false;
  }
  return relative
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

async function listSandboxFiles(
  session: Session,
  sourceDir: string
): Promise<string[]> {
  // -type f excludes symlinks, so we never copy a link that points outside the
  // build directory. Paths come back relative to sourceDir (find . -type f).
  const result = await session.run({
    command: 'find . -type f -printf "%P\\n"',
    workingDirectory: sourceDir,
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Could not list files in ${sourceDir}`);
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Copy a built static site out of the E2B sandbox to the host, file by file,
 * validating every destination path stays within the site root. Builds into a
 * staging directory, then atomically swaps it into place so a half-finished or
 * malicious deploy never leaves a partial site live.
 */
export async function deploySiteFromSandbox({
  name,
  session,
  sourceDir,
}: {
  name: string;
  session: Session;
  sourceDir: string;
}): Promise<DeployResult> {
  const files = await listSandboxFiles(session, sourceDir);
  if (files.length === 0) {
    return { error: `No files found in ${sourceDir}.`, ok: false };
  }
  if (files.length > MAX_FILES) {
    return {
      error: `Too many files (${files.length} > ${MAX_FILES}).`,
      ok: false,
    };
  }

  const finalRoot = siteRoot(name);
  const staging = nodePath.join(
    sitesRoot(),
    '.staging',
    `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  let totalBytes = 0;
  try {
    await mkdir(staging, { recursive: true });

    for (const relative of files) {
      if (!isSafeRelative(relative)) {
        return { error: `Unsafe path in build: ${relative}`, ok: false };
      }
      const dest = resolveWithin(staging, relative);
      if (!dest) {
        return { error: `Path escapes site root: ${relative}`, ok: false };
      }

      const bytes = await session.readBinaryFile({
        path: nodePath.posix.join(sourceDir, relative),
      });
      if (!bytes) {
        return { error: `Could not read ${relative} from sandbox.`, ok: false };
      }
      if (bytes.byteLength > MAX_FILE_BYTES) {
        return { error: `File too large: ${relative}`, ok: false };
      }
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) {
        return { error: 'Site exceeds total size limit.', ok: false };
      }

      await mkdir(nodePath.dirname(dest), { recursive: true });
      await writeFile(dest, bytes);
    }

    // Atomic swap: replace any existing site in one rename.
    await rm(finalRoot, { force: true, recursive: true });
    await rename(staging, finalRoot);

    logger.info(
      { fileCount: files.length, name, totalBytes },
      '[sites] deployed site'
    );
    return { fileCount: files.length, ok: true, totalBytes };
  } finally {
    await rm(staging, { force: true, recursive: true }).catch(() => {
      // best-effort cleanup; the staging dir is unique per deploy
    });
  }
}

/** Remove a deployed site from the host. */
export async function removeSite(name: string): Promise<void> {
  await rm(siteRoot(name), { force: true, recursive: true });
  logger.info({ name }, '[sites] removed site');
}
