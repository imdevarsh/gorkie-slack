const WORD_SPLIT = /[_-]+/;

export function formatToolName(name: string): string {
  return name
    .split(WORD_SPLIT)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
