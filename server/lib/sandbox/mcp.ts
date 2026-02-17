import { join } from 'node:path';
import { build } from 'esbuild';

const LOCAL_MCP_ENTRY = join(
  import.meta.dirname,
  '../ai/tools/sandbox/index.ts'
);

export const SANDBOX_MCP_DIR = '/opt/mcp/custom-tools';
export const SANDBOX_MCP_SERVER_PATH = `${SANDBOX_MCP_DIR}/mcp-server.cjs`;

let mcpServerPromise: Promise<Uint8Array> | null = null;

function formatBuildErrors(logs: Array<{ message?: string }>): string {
  return logs.map((log) => log.message ?? 'unknown build error').join('; ');
}

async function buildMCPServer(): Promise<Uint8Array> {
  const result = await build({
    entryPoints: [LOCAL_MCP_ENTRY],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    minify: true,
    write: false,
  });

  if (result.outputFiles.length === 0) {
    throw new Error(
      `Failed to bundle MCP server: ${formatBuildErrors(
        result.warnings as Array<{ message?: string }>
      )}`
    );
  }

  const output = result.outputFiles[0];
  if (!output) {
    throw new Error('Failed to bundle MCP server: no output generated');
  }

  return output.contents;
}

export function mcpServer(): Promise<Uint8Array> {
  if (!mcpServerPromise) {
    mcpServerPromise = buildMCPServer();
  }

  return mcpServerPromise;
}
