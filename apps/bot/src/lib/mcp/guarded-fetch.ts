import { createGuardedFetch } from '@repo/utils';
import { mcp } from '@/config';

export const guardedMcpFetch = Object.assign(
  createGuardedFetch({
    timeoutMs: mcp.requestTimeoutMs,
    maxResponseBytes: mcp.maxResponseBytes,
  }),
  { preconnect: fetch.preconnect }
);
