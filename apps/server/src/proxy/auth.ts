import { env } from "../env";

const BEARER_PREFIX = "Bearer ";

export function getBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

export function isInternalToken(token: string | null): boolean {
  return token === env.PROXY_API_KEY;
}
