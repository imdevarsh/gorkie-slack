import type { Sandbox } from 'modal';
import logger from '~/lib/logger';
import { runSandboxCommand } from './modal';
import { sandboxPath } from './paths';

export async function makeFolders(instance: Sandbox): Promise<void> {
  const result = await runSandboxCommand(instance, {
    cmd: 'mkdir',
    args: [
      '-p',
      sandboxPath('agent/turns'),
      sandboxPath('attachments'),
      sandboxPath('output'),
    ],
  }).catch((error: unknown) => {
    logger.warn({ error }, '[sandbox] Failed to create directories');
    return null;
  });

  if (result && result.exitCode !== 0) {
    logger.warn({ stderr: result.stderr }, '[sandbox] mkdir returned non-zero');
  }
}

export async function installTools(instance: Sandbox): Promise<void> {
  const install = await runSandboxCommand(instance, {
    cmd: 'sh',
    args: [
      '-lc',
      [
        'set -e',
        'if ! command -v rg >/dev/null 2>&1 || ! command -v fd >/dev/null 2>&1; then',
        '  apt-get update',
        '  apt-get install -y --no-install-recommends ripgrep fd-find',
        '  ln -sf /usr/bin/fdfind /usr/local/bin/fd || true',
        'fi',
      ].join('\n'),
    ],
  }).catch((error: unknown) => {
    logger.warn({ error }, '[sandbox] Failed to install fd/rg');
    return null;
  });

  if (install && install.exitCode !== 0) {
    logger.warn(
      {
        stderr: install.stderr.slice(0, 2000),
        stdout: install.stdout.slice(0, 2000),
      },
      '[sandbox] fd/rg installation returned non-zero'
    );
  }
}
