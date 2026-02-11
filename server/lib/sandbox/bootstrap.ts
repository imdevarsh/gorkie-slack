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

export async function hasTool(
  instance: Sandbox,
  tool: 'rg' | 'fd'
): Promise<boolean> {
  const result = await instance
    .runCommand({
      cmd: 'sh',
      args: ['-c', `command -v ${tool} >/dev/null 2>&1`],
    })
    .catch(() => null);

  return result?.exitCode === 0;
}

export async function installTools(instance: Sandbox): Promise<void> {
  const hasRg = await hasTool(instance, 'rg');
  const hasFd = await hasTool(instance, 'fd');
  if (hasRg && hasFd) {
    return;
  }

  const install = async (
    repo: string,
    binary: 'rg' | 'fd'
  ): Promise<boolean> => {
    const result = await instance
      .runCommand({
        cmd: 'sh',
        args: [
          '-c',
          [
            'set -e',
            'ARCH="$(uname -m)"',
            'case "$ARCH" in',
            '  x86_64) TARGET="x86_64-unknown-linux-musl.tar.gz" ;;',
            '  aarch64|arm64) TARGET="aarch64-unknown-linux-musl.tar.gz" ;;',
            '  *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;',
            'esac',
            'TMPDIR="$(mktemp -d)"',
            'cleanup() { rm -rf "$TMPDIR"; }',
            'trap cleanup EXIT',
            'cd "$TMPDIR"',
            `URL="$(curl -fsSL "https://api.github.com/repos/${repo}/releases/latest" | grep browser_download_url | grep "$TARGET" | cut -d '"' -f 4 | head -n 1)"`,
            '[ -n "$URL" ]',
            'curl -fsSL "$URL" -o pkg.tgz',
            'tar -xzf pkg.tgz',
            `BIN_PATH="$(find . -type f -name "${binary}" | head -n 1)"`,
            '[ -n "$BIN_PATH" ]',
            `sudo install -m 0755 "$BIN_PATH" "/usr/local/bin/${binary}"`,
            `command -v ${binary} >/dev/null 2>&1`,
          ].join('\n'),
        ],
      })
      .catch(() => null);

    if (!result) {
      return false;
    }

    if (result.exitCode !== 0) {
      const stdout = await result.stdout();
      const stderr = await result.stderr();
      logger.warn(
        { exitCode: result.exitCode, stdout, stderr },
        `Failed to install ${binary} from ${repo}`
      );
      return false;
    }

    return true;
  };

  if (!hasRg) {
    await install('BurntSushi/ripgrep', 'rg');
  }

  if (!hasFd) {
    await install('sharkdp/fd', 'fd');
  }
}
