import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { showFile } from './tools/show-file';

const tools = [showFile] as const;

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'gorkie',
    version: '1.0.0',
  });

  for (const tool of tools) {
    tool(server);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`gorkie mcp failed: ${message}\n`);
  process.exit(1);
});
