import { createGuardedFetch } from '@repo/utils';
import { mcp } from '@/config';

export const guardedMcpFetch = Object.assign(
  createGuardedFetch({
    timeoutMs: mcp.requestTimeoutMs,
  }),
  { preconnect: fetch.preconnect }
);
