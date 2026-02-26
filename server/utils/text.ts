import stripAnsi from 'strip-ansi';

const CONTROL_CHARS_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;

export function cleanTerminalText(text: string): string {
  return stripAnsi(text).replace(/\r/g, '');
}

export function cleanText(text: string): string {
  return cleanTerminalText(text).replace(CONTROL_CHARS_RE, '');
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
