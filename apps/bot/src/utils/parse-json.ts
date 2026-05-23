import type { ZodType } from 'zod';

export function safeParseJson<T>(
  raw: string | null | undefined,
  schema: ZodType<T>
): T | null {
  if (!raw) {
    return null;
  }

  try {
    const result = schema.parse(JSON.parse(raw) as unknown);
    return result;
  } catch {
    return null;
  }
}
