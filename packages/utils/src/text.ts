import stripAnsi from 'strip-ansi';

export function cleanTerminalText(text: string): string {
  return stripAnsi(text).replace(/\r/g, '');
}

export function cleanText(text: string): string {
  const withoutAnsi = cleanTerminalText(text);
  let output = '';

  for (const char of withoutAnsi) {
    const code = char.charCodeAt(0);
    const isControl =
      code === 0x0d ||
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      (code >= 0x7f && code <= 0x9f);
    if (isControl) {
      continue;
    }
    output += char;
  }

  return output;
}

export function clampText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (maxLength <= 0) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  if (maxLength <= 3) {
    return normalized.slice(0, maxLength);
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function trimmed(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}
