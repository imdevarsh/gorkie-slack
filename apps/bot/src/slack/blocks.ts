import { clampText } from '@repo/utils/text';

export function codeBlock({
  maxLength,
  value,
}: {
  maxLength: number;
  value: string;
}): string {
  return `\`\`\`${clampText(value.replaceAll('```', "'''"), maxLength)}\`\`\``;
}
