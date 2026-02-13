import { ModalClient, type Sandbox } from 'modal';
import { sandbox as config } from '~/config';
import { env } from '~/env';
import logger from '~/lib/logger';
import { sandboxPath } from './paths';

const modal = new ModalClient({
  tokenId: env.MODAL_TOKEN_ID,
  tokenSecret: env.MODAL_TOKEN_SECRET,
  environment: config.environment,
});

function getModalApp() {
  return modal.apps.fromName(config.appName, { createIfMissing: true });
}

export async function createModalSandbox(
  sourceImageId?: string
): Promise<Sandbox> {
  const app = await getModalApp();
  const image = sourceImageId
    ? await modal.images.fromId(sourceImageId)
    : modal.images.fromRegistry(config.baseImage);

  return modal.sandboxes.create(app, image, {
    timeoutMs: config.timeoutMs,
    idleTimeoutMs: config.idleTimeoutMs,
    cpu: 0.125,
    memoryMiB: 1024,
    workdir: sandboxPath('.'),
  });
}

export async function getModalSandboxById(
  sandboxId: string
): Promise<Sandbox | null> {
  try {
    const sandbox = await modal.sandboxes.fromId(sandboxId);
    const exitCode = await sandbox.poll();
    return exitCode === null ? sandbox : null;
  } catch (error) {
    logger.debug(
      { error, sandboxId },
      '[sandbox] Failed to load sandbox by id'
    );
    return null;
  }
}

export async function runSandboxCommand(
  sandbox: Sandbox,
  params: {
    cmd: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
  }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const process = await sandbox.exec([params.cmd, ...(params.args ?? [])], {
    mode: 'text',
    stdout: 'pipe',
    stderr: 'pipe',
    workdir: params.cwd,
    env: params.env,
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    process.stdout.readText(),
    process.stderr.readText(),
    process.wait(),
  ]);

  return { stdout, stderr, exitCode };
}

export async function writeSandboxFiles(
  sandbox: Sandbox,
  files: Array<{
    path: string;
    content: Buffer | Uint8Array | string;
  }>
): Promise<void> {
  for (const file of files) {
    const mkdir = await runSandboxCommand(sandbox, {
      cmd: 'sh',
      args: ['-lc', 'mkdir -p "$(dirname "$1")"', '--', file.path],
    });
    if (mkdir.exitCode !== 0) {
      throw new Error(
        `mkdir failed for ${file.path}: ${mkdir.stderr || mkdir.stdout}`
      );
    }

    const handle = await sandbox.open(file.path, 'w+');
    const bytes =
      typeof file.content === 'string'
        ? Buffer.from(file.content, 'utf-8')
        : Buffer.from(file.content);

    await handle.write(bytes);
    await handle.flush();
    await handle.close();
  }
}

export async function readSandboxFile(
  sandbox: Sandbox,
  filePath: string
): Promise<Buffer> {
  const handle = await sandbox.open(filePath, 'r');
  const bytes = await handle.read();
  await handle.close();
  return Buffer.from(bytes);
}

export async function snapshotSandboxFilesystem(
  sandbox: Sandbox
): Promise<string> {
  const image = await sandbox.snapshotFilesystem();
  return image.imageId;
}

export async function terminateModalSandbox(sandbox: Sandbox): Promise<void> {
  await sandbox.terminate();
}

export async function deleteSnapshotImage(imageId: string): Promise<void> {
  await modal.images.delete(imageId).catch((error: unknown) => {
    logger.warn(
      { error, imageId },
      '[sandbox] Failed to delete snapshot image'
    );
  });
}
