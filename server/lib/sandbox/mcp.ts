import { join } from 'node:path';
import { build } from 'bun';

const LOCAL_MCP_ENTRY = join(
  import.meta.dirname,
  '../ai/tools/sandbox/index.ts'
);

export const SANDBOX_MCP_NAME = 'gorkie';
export const SANDBOX_MCP_DIR = '/opt/mcp/gorkie';
export const SANDBOX_MCP_SERVER_PATH = `${SANDBOX_MCP_DIR}/mcp-server.cjs`;

let mcpServerBundle: Promise<Uint8Array> | null = null;

function formatBuildErrors(logs: Array<{ message?: string }>): string {
  return logs.map((log) => log.message ?? 'unknown build error').join('; ');
}

async function buildMcpServer(): Promise<Uint8Array> {
  const result = await build({
    entrypoints: [LOCAL_MCP_ENTRY],
    target: 'node',
    format: 'cjs',
    minify: true,
  });

  if (!result.success || result.outputs.length === 0) {
    throw new Error(
      `Failed to bundle MCP server: ${formatBuildErrors(result.logs)}`
    );
  }

  const output = result.outputs[0];
  if (!output) {
    throw new Error('Failed to bundle MCP server: no output generated');
  }

  const bytes = await output.arrayBuffer();
  return new Uint8Array(bytes);
}

export function loadMcpServerBundle(): Promise<Uint8Array> {
  if (!mcpServerBundle) {
    mcpServerBundle = buildMcpServer();
  }

  return mcpServerBundle;
}
