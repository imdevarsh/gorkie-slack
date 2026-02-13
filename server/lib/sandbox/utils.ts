import path from 'node:path';

const SANDBOX_HOME = '/home/vercel-sandbox';

export function sandboxPath(relativePath: string): string {
  if (relativePath === '.' || relativePath === './') {
    return SANDBOX_HOME;
  }
  if (relativePath.startsWith('/')) {
    return relativePath;
  }
  return path.join(SANDBOX_HOME, relativePath);
}

export function turnsPath(messageTs: string): string {
  return sandboxPath(path.join('agent', 'turns', `${messageTs}.json`));
}
