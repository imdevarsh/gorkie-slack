import { asRecord } from '@repo/utils/record';

const HTTP_ERROR_RE = /\(HTTP (\d+)\):\s*([^\n]+)/;

export function formatMCPError(message: string): string {
  const match = message.match(HTTP_ERROR_RE);
  if (!match) {
    return message;
  }
  const status = match[1] ?? '';
  const body = match[2] ?? '';
  try {
    const parsed: unknown = JSON.parse(body.trim());
    const obj = asRecord(parsed);
    const desc = obj?.error_description ?? obj?.error ?? obj?.message;
    if (typeof desc === 'string') {
      return `HTTP ${status}: ${desc}`;
    }
  } catch {
    // Body wasn't JSON — fall through to the raw status + body.
  }
  return `HTTP ${status}: ${body.trim()}`;
}
