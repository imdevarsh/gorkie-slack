export function formatToolInput(input: unknown): string {
  try {
    return `Input:\n${JSON.stringify(input, null, 2) ?? String(input)}`;
  } catch {
    return `Input:\n${String(input)}`;
  }
}
