import { mcpServerUrlSchema } from '@repo/validators';

export type GuardedFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export function createGuardedFetch({
  timeoutMs,
  maxResponseBytes,
}: {
  timeoutMs: number;
  maxResponseBytes: number;
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
      if (!response.body) {
        return response;
      }

      let bytes = 0;
      const counted = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            bytes += chunk.byteLength;
            if (bytes > maxResponseBytes) {
              controller.error(new Error('MCP response exceeded byte limit.'));
              return;
            }
            controller.enqueue(chunk);
          },
        })
      );

      return new Response(counted, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}
