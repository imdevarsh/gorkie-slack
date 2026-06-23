export function clamp(
  value: string | undefined,
  max = 280
): string | undefined {
  if (value === undefined) {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}
