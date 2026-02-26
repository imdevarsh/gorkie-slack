import { cleanText, trimmed } from '~/utils/text';

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return trimmed(cleanText(value));
}

export function getArg(args: unknown, key: string, fallback: string): string {
  return asString(asRecord(args)?.[key]) ?? fallback;
}

export function extractTextResult(result: unknown): string | undefined {
  const content = asRecord(result)?.content;
  if (!Array.isArray(content)) {
    return undefined;
  }

  const chunks: string[] = [];
  for (const item of content) {
    const part = asRecord(item);
    if (part?.type !== 'text') {
      continue;
    }

    const text = asString(part.text);
    if (text) {
      chunks.push(text);
    }
  }

  const joined = chunks.join('\n').trim();
  return joined.length > 0 ? joined : undefined;
}

export function extractErrorResult(result: unknown): string | undefined {
  const error = asRecord(result)?.error;
  if (!error) {
    return undefined;
  }

  if (typeof error === 'string') {
    return asString(error);
  }

  if (typeof error === 'object') {
    const message = asString(asRecord(error)?.message);
    if (message) {
      return message;
    }
  }

  return undefined;
}
