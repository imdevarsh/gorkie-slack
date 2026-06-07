export function formatToolInput(input: unknown): string {
  try {
    return `Input:\n${JSON.stringify(input, null, 2)}`;
  } catch {
    return `Input:\n${String(input)}`;
  }
}
