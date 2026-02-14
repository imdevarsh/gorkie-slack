import path from 'node:path';

export function sandboxPath(relativePath: string): string {
  if (relativePath === '.' || relativePath === './') {
    return '.';
  }
  if (relativePath.startsWith('/')) {
    return relativePath;
  }
  return relativePath;
}

export function turnsPath(messageTs: string): string {
  return sandboxPath(path.join('agent', 'turns', `${messageTs}.json`));
}
