export function value(input: unknown, key: string): unknown {
  return input && typeof input === 'object' && key in input
    ? Reflect.get(input, key)
    : undefined;
}

export function text(input: unknown, key: string): string | undefined {
  const raw = value(input, key);
  return typeof raw === 'string' && raw ? raw : undefined;
}

export function number(input: unknown, key: string): number | undefined {
  const raw = value(input, key);
  return typeof raw === 'number' ? raw : undefined;
}

export function bool(input: unknown, key: string): boolean | undefined {
  const raw = value(input, key);
  return typeof raw === 'boolean' ? raw : undefined;
}

export function arraySize(input: unknown, key: string): number | undefined {
  const raw = value(input, key);
  return Array.isArray(raw) ? raw.length : undefined;
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
  const message = text(output, 'message') ?? text(output, 'error');
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
