export function getTime(): string {
  const now = new Date();
  return now.toISOString();
}
