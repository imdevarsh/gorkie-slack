import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerShowFileTool(server: McpServer): void {
  server.tool(
    'showFile',
    'Mark a sandbox file for Slack upload',
    {
      path: z.string().describe('Absolute file path to upload'),
      title: z.string().optional().describe('Optional title for Slack'),
    },
    ({ path: filePath, title }) => {
      if (!path.isAbsolute(filePath)) {
        throw new Error('path must be absolute');
      }

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              path: filePath,
              title: title ?? path.basename(filePath),
            }),
          },
        ],
      };
    }
  );
}
