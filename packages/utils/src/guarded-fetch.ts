import { mcpServerUrlSchema } from '@repo/validators';

export type GuardedFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

function limitResponseSize(
  response: Response,
  maxResponseBytes: number
): Response {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    response.body?.cancel().catch(() => undefined);
    throw new Error('MCP response exceeded size limit');
  }

  if (!response.body) {
    return response;
  }

  let received = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > maxResponseBytes) {
        controller.error(new Error('MCP response exceeded size limit'));
        return;
      }
      controller.enqueue(chunk);
    },
  });
  return new Response(response.body.pipeThrough(counter), response);
}

export function createGuardedFetch({
  maxResponseBytes,
  timeoutMs,
}: {
  maxResponseBytes?: number;
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
      if (maxResponseBytes === undefined) {
        return response;
      }
      return limitResponseSize(response, maxResponseBytes);
    } finally {
      clearTimeout(timeout);
    }
  };
}
