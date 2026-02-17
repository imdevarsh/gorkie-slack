import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerShowFileTool } from './tools/show-file';

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'gorkie',
    version: '1.0.0',
  });

  registerShowFileTool(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`gorkie mcp failed: ${message}\n`);
  process.exit(1);
});
