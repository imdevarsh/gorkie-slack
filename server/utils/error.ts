export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return String(error);
}

export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(errorMessage(error), { cause: error });
}

export function toLogError(error: unknown): { err: Error } {
  return { err: toError(error) };
}

interface ErrorDetails {
  code?: string;
  message: string;
  name: string;
  statusCode?: number;
}

export function getErrorDetails(error: unknown): ErrorDetails {
  const record =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : undefined;

  let name = 'Error';
  if (typeof record?.name === 'string' && record.name.trim().length > 0) {
    name = record.name;
  } else if (error instanceof Error) {
    name = error.name;
  }
  const message = errorMessage(error);
  const statusCode =
    typeof record?.statusCode === 'number' ? record.statusCode : undefined;
  const code = typeof record?.code === 'string' ? record.code : undefined;

  return { name, message, statusCode, code };
}

export function formatUserFacingError(error: unknown): string {
  const details = getErrorDetails(error);
  const parts = [details.name];

  if (details.statusCode !== undefined) {
    parts.push(`status ${details.statusCode}`);
  }

  if (details.code) {
    parts.push(`code ${details.code}`);
  }

  return `Something went wrong. ${parts.join(' | ')}: ${details.message}`;
}
