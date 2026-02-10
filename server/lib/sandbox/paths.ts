import path from 'node:path';

const SANDBOX_HOME = '/home/vercel-sandbox';

export function sandboxPath(relativePath: string): string {
  if (relativePath.startsWith('/')) {
    return relativePath;
  }
  return path.join(SANDBOX_HOME, relativePath);
}

export function outputDir(messageTs: string): string {
  return sandboxPath(path.join('output', messageTs));
}

export function attachmentsDir(messageTs: string): string {
  return sandboxPath(path.join('attachments', messageTs));
}

export function turnsPath(messageTs: string): string {
  return sandboxPath(path.join('agent', 'turns', `${messageTs}.json`));
}
