import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function isBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part));
  const [a, b] = parts;
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b !== undefined && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a === 224 ||
    (a !== undefined && a >= 225) ||
    address === '255.255.255.255' ||
    address === '169.254.169.254'
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('ff') ||
    normalized.includes('169.254.169.254')
  );
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
    if (
      (address.family === 4 && isBlockedIpv4(address.address)) ||
      (address.family === 6 && isBlockedIpv6(address.address))
    ) {
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
