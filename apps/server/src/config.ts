import type { MCPToolMode } from '@repo/db/schema';

export const mcp: {
  defaultToolMode: MCPToolMode;
  requestTimeoutMs: number;
} = {
  defaultToolMode: 'ask',
  requestTimeoutMs: 15_000,
};
