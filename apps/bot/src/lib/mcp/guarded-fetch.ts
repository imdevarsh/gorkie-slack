import { createGuardedFetch } from '@repo/utils';
import { mcp } from '@/config';

export const guardedMCPFetch = Object.assign(
  createGuardedFetch({
    maxResponseBytes: mcp.maxResponseBytes,
    timeoutMs: mcp.requestTimeoutMs,
  }),
  { preconnect: fetch.preconnect }
);
