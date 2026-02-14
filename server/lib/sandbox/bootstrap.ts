import type { Sandbox } from '@vercel/sandbox';
import logger from '~/lib/logger';
import { sandboxPath } from './utils';

export async function makeFolders(instance: Sandbox): Promise<void> {
  await instance
    .runCommand({
      cmd: 'mkdir',
      args: ['-p', sandboxPath('attachments'), sandboxPath('agent/turns'), sandboxPath('output')],
    })
    .catch((error: unknown) => {
      logger.warn({ error }, '[sandbox] Failed to create directories');
    });
}

export async function installTools(instance: Sandbox): Promise<void> {
  const command = `
if command -v rg >/dev/null 2>&1 && command -v fd >/dev/null 2>&1; then
  exit 0
fi

if command -v dnf >/dev/null 2>&1; then
  dnf install -y ripgrep fd-find || dnf install -y ripgrep fd
elif command -v yum >/dev/null 2>&1; then
  yum install -y ripgrep fd-find || yum install -y ripgrep fd
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update && apt-get install -y ripgrep fd-find
else
  echo "No supported package manager found for installing ripgrep/fd" >&2
  exit 1
fi

if ! command -v fd >/dev/null 2>&1 && command -v fdfind >/dev/null 2>&1; then
  ln -sf "$(command -v fdfind)" /usr/local/bin/fd
fi
`;

  try {
    const result = await instance.runCommand({
      cmd: 'sh',
      args: ['-c', command],
    });

    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      logger.warn(
        { exitCode: result.exitCode, stderr: stderr.slice(0, 2000) },
        '[sandbox] Failed to install tools'
      );
    }
  } catch (error) {
    logger.warn({ error }, '[sandbox] Failed to install tools');
  }
}
