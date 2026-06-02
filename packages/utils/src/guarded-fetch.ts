import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export async function assertSafeHttpsUrl(input: string | URL): Promise<URL> {
  const url = input instanceof URL ? input : new URL(input);
  if (url.protocol !== 'https:') {
    throw new Error('MCP server URL must use https.');
  }

  const hostname = url.hostname;
  const parsedIp = isIP(hostname);
  const addresses =
    parsedIp === 0
      ? await lookup(hostname, { all: true, verbatim: true })
      : [{ address: hostname, family: parsedIp }];

  for (const address of addresses) {
    if (
      [
        'broadcast',
        'carrierGradeNat',
        'linkLocal',
        'loopback',
        'multicast',
        'private',
        'reserved',
        'unspecified',
        'uniqueLocal',
      ].includes(ipaddr.process(address.address).range())
    ) {
      throw new Error('MCP server URL resolves to a blocked network address.');
    }
  }

  return url;
}

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
    const url = await assertSafeHttpsUrl(
      typeof input === 'string' || input instanceof URL ? input : input.url
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
