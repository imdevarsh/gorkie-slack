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
