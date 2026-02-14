export function sandboxPath(relativePath: string): string {
  if (relativePath === '.' || relativePath === './') {
    return '.';
  }
  if (relativePath.startsWith('/')) {
    return relativePath;
  }
  return relativePath;
}
