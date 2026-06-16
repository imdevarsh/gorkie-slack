export function sanitizeFilename(value: string): string {
  const segment = value.split(/[\\/]/).at(-1) ?? '';
  return segment.replace(/[^a-zA-Z0-9._-]/g, '_');
}
