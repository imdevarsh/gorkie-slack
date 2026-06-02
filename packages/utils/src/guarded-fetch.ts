import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

const BLOCKED_IP_RANGES = new Set([
  'broadcast',
  'carrierGradeNat',
  'linkLocal',
  'loopback',
  'multicast',
  'private',
  'reserved',
  'unspecified',
  'uniqueLocal',
]);

function isBlockedIp(address: string): boolean {
  return BLOCKED_IP_RANGES.has(ipaddr.process(address).range());
}

async function assertSafeHttpsUrl(input: string | URL): Promise<URL> {
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
    if (isBlockedIp(address.address)) {
      throw new Error('MCP server URL resolves to a blocked network address.');
    }
  }

  return url;
}

function limitResponseBytes(response: Response, maxBytes: number): Response {
  if (!response.body) {
    return response;
  }

  let bytes = 0;
  const counted = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > maxBytes) {
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
      return limitResponseBytes(response, maxResponseBytes);
    } finally {
      clearTimeout(timeout);
    }
  };
}

export async function validateHttpsUrlForServer(
  input: string
): Promise<string> {
  return (await assertSafeHttpsUrl(input)).toString();
}
