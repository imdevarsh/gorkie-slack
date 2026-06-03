export function formatMcpError(message: string): string {
  const match = message.match(/\(HTTP (\d+)\):\s*([^\n]+)/);
  if (!match) {
    return message;
  }
  const status = match[1] ?? '';
  const body = match[2] ?? '';
  try {
    const parsed: unknown = JSON.parse(body.trim());
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const desc = obj.error_description ?? obj.error ?? obj.message;
      if (typeof desc === 'string') {
        return `HTTP ${status}: ${desc}`;
      }
    }
  } catch {}
  return `HTTP ${status}: ${body.trim()}`;
}
