import { createGuardedFetch } from '@repo/utils';
import { mcp } from '@/config';

export const guardedMcpFetch = createGuardedFetch({
  timeoutMs: mcp.requestTimeoutMs,
  maxResponseBytes: mcp.maxResponseBytes,
});

export { validateHttpsUrlForServer } from '@repo/utils';
