import path from 'node:path';

const SANDBOX_HOME = '/workspace';

export function sandboxPath(relativePath: string): string {
  if (relativePath === '.' || relativePath === './') {
    return SANDBOX_HOME;
  }
  if (relativePath.startsWith('/')) {
    return relativePath;
  }
  return path.posix.join(SANDBOX_HOME, relativePath);
}

export function outputDir(messageTs: string): string {
  return sandboxPath(path.posix.join('output', messageTs));
}

export function attachmentsDir(messageTs: string): string {
  return sandboxPath(path.posix.join('attachments', messageTs));
}

export function turnsDir(): string {
  return sandboxPath(path.posix.join('agent', 'turns'));
}

export function turnsPath(messageTs: string): string {
  return sandboxPath(path.posix.join('agent', 'turns', `${messageTs}.json`));
}
