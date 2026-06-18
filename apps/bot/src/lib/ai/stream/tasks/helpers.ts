export function field(input: unknown, key: string): unknown {
  return input && typeof input === 'object' && key in input
    ? (input as Record<string, unknown>)[key]
    : undefined;
}

export function textField(input: unknown, key: string): string | undefined {
  const value = field(input, key);
  return typeof value === 'string' && value ? value : undefined;
}

export function numberField(input: unknown, key: string): number | undefined {
  const value = field(input, key);
  return typeof value === 'number' ? value : undefined;
}

export function booleanField(input: unknown, key: string): boolean | undefined {
  const value = field(input, key);
  return typeof value === 'boolean' ? value : undefined;
}

export function arrayLength(input: unknown, key: string): number | undefined {
  const value = field(input, key);
  return Array.isArray(value) ? value.length : undefined;
}

export function plural(
  count: number,
  singular: string,
  pluralValue = `${singular}s`
): string {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

export function errorOutput(output: unknown): string | undefined {
  if (output instanceof Error) {
    return `Error: ${output.message}`;
  }
  if (typeof output === 'string') {
    return `Error: ${output}`;
  }
  const message = textField(output, 'message') ?? textField(output, 'error');
  return message ? `Error: ${message}` : 'Error: tool failed';
}
