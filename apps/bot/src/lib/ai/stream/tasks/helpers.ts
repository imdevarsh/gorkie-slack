export function field(input: unknown, key: string): unknown {
  return input && typeof input === 'object' && key in input
    ? Reflect.get(input, key)
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
    return `**Error**: ${output.message}`;
  }
  if (typeof output === 'string') {
    return `**Error**: ${output.replace(/^Error:\s*/, '')}`;
  }
  const message = textField(output, 'message') ?? textField(output, 'error');
  if (!message) {
    return '**Error**: tool failed';
  }
  return `**Error**: ${message.replace(/^Error:\s*/, '')}`;
}

export function resultErrorOutput(output: unknown): string | undefined {
  if (
    output === null ||
    typeof output !== 'object' ||
    !('error' in output) ||
    typeof output.error !== 'string' ||
    output.error.length === 0
  ) {
    return;
  }
  return errorOutput(output);
}
