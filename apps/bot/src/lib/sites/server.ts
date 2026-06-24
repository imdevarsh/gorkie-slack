import { execFile } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import nodePath from 'node:path';
import { promisify } from 'node:util';
import { env } from '@/env';
import logger from '@/lib/logger';
import { isValidSiteName, resolveWithin, siteRoot, sitesRoot } from './paths';

const execFileAsync = promisify(execFile);

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
};

const PREFIX = '/gorkiesites/';

async function ensureSelfSignedCert(): Promise<{ cert: string; key: string }> {
  const tlsDir = nodePath.join(sitesRoot(), '.tls');
  const certPath = nodePath.join(tlsDir, 'cert.pem');
  const keyPath = nodePath.join(tlsDir, 'key.pem');

  const existing = await Promise.all([
    readFile(certPath).catch(() => null),
    readFile(keyPath).catch(() => null),
  ]);
  if (existing[0] && existing[1]) {
    return { cert: existing[0].toString(), key: existing[1].toString() };
  }

  await mkdir(tlsDir, { recursive: true });
  // 10-year self-signed cert; browsers warn unless trusted, which is expected.
  await execFileAsync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '3650',
    '-subj',
    `/CN=${env.SITES_PUBLIC_HOST ?? 'gorkie-sites'}`,
  ]);
  logger.info({ tlsDir }, '[sites] generated self-signed certificate');
  return {
    cert: (await readFile(certPath)).toString(),
    key: (await readFile(keyPath)).toString(),
  };
}

function notFound(): Response {
  return new Response('Not found', { headers: SECURITY_HEADERS, status: 404 });
}

async function resolveSiteFile(pathname: string): Promise<string | null> {
  // Expect /gorkiesites/<name>/<rest...>
  const remainder = pathname.slice(PREFIX.length);
  const slash = remainder.indexOf('/');
  const name = slash === -1 ? remainder : remainder.slice(0, slash);
  if (!isValidSiteName(name)) {
    return null;
  }

  let rest = slash === -1 ? '' : remainder.slice(slash + 1);
  try {
    rest = decodeURIComponent(rest);
  } catch {
    return null;
  }

  const root = siteRoot(name);
  const candidate = resolveWithin(root, rest);
  if (!candidate) {
    return null;
  }

  // Directory (or trailing slash / bare site) → serve its index.html.
  let target = candidate;
  const info = await stat(candidate).catch(() => null);
  if (!info || info.isDirectory()) {
    target = nodePath.join(candidate, 'index.html');
  }

  const fileInfo = await stat(target).catch(() => null);
  if (!fileInfo?.isFile()) {
    return null;
  }
  // Final guard: the resolved file must still live inside the site root.
  return resolveWithin(root, nodePath.relative(root, target));
}

/**
 * Start the static-site HTTPS server on SITES_PORT. Serves prebuilt files from
 * SITES_ROOT/<name>/ under /gorkiesites/<name>/ and nothing else — no directory
 * listings, no execution, strict path containment. Bind failures are logged and
 * swallowed so they never crash the bot (e.g. in local dev without port 443).
 */
export async function startSitesServer(): Promise<void> {
  if (!env.SITES_ENABLED) {
    logger.info('[sites] hosting disabled (SITES_ENABLED=false)');
    return;
  }

  try {
    await mkdir(sitesRoot(), { recursive: true });
    const tls = await ensureSelfSignedCert();

    Bun.serve({
      fetch: async (request) => {
        const { pathname } = new URL(request.url);

        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return new Response('Method not allowed', {
            headers: SECURITY_HEADERS,
            status: 405,
          });
        }
        if (!pathname.startsWith(PREFIX)) {
          return notFound();
        }

        const filePath = await resolveSiteFile(pathname);
        if (!filePath) {
          return notFound();
        }
        return new Response(Bun.file(filePath), { headers: SECURITY_HEADERS });
      },
      port: env.SITES_PORT,
      tls,
    });
    logger.info({ port: env.SITES_PORT }, '[sites] static host listening');
  } catch (error) {
    logger.error({ err: error }, '[sites] failed to start static host');
  }
}
