import { mcpServerUrlSchema } from '@repo/validators';

export type GuardedFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export function createGuardedFetch({
  timeoutMs,
}: {
  timeoutMs: number;
}): GuardedFetch {
  return async (input, init) => {
    const url = await mcpServerUrlSchema.parseAsync(
      typeof input === 'string' || input instanceof URL
        ? input.toString()
        : input.url
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        redirect: 'error',
        signal: init?.signal
          ? AbortSignal.any([init.signal, controller.signal])
          : controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  };
}
