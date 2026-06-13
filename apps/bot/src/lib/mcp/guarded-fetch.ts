import { createGuardedFetch } from '@repo/utils';
import { mcp } from '@/config';

export const guardedMCPFetch = Object.assign(
  createGuardedFetch({
    timeoutMs: mcp.requestTimeoutMs,
  }),
  { preconnect: fetch.preconnect }
);
