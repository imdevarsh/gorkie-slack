const SANDBOX_HOME = '/home/vercel-sandbox';

export function sandboxPath(relativePath: string): string {
  if (relativePath.startsWith('/')) {
    return relativePath;
  }
  return `${SANDBOX_HOME}/${relativePath}`;
}

export function outputDir(messageTs: string): string {
  return sandboxPath(`output/${messageTs}`);
}

export function attachmentsDir(messageTs: string): string {
  return sandboxPath(`attachments/${messageTs}`);
}

export function turnsPath(messageTs: string): string {
  return sandboxPath(`agent/turns/${messageTs}.json`);
}
