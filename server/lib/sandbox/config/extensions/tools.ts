import fs from 'node:fs';
import nodePath from 'node:path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

const DEFAULT_BASH_TIMEOUT_SECONDS = 2 * 60;

const tools = [
  { id: 'read', tool: createReadTool },
  { id: 'bash', tool: createBashTool },
  { id: 'edit', tool: createEditTool },
  { id: 'write', tool: createWriteTool },
  { id: 'find', tool: createFindTool },
  { id: 'grep', tool: createGrepTool },
  { id: 'ls', tool: createLsTool },
] as const;

export default function registerToolsExtension(pi: ExtensionAPI) {
  const cwd = process.cwd();

  for (const { id, tool } of tools) {
    const builtIn = tool(cwd);
    const parameters =
      id === 'bash'
        ? Type.Intersect([
            Type.Omit(builtIn.parameters, ['timeout']),
            Type.Object({
              timeout: Type.Optional(
                Type.Number({
                  description: 'Timeout in seconds (defaults to 120 seconds).',
                  default: DEFAULT_BASH_TIMEOUT_SECONDS,
                })
              ),
            }),
          ])
        : builtIn.parameters;

    pi.registerTool({
      ...builtIn,
      name: id,
      parameters: Type.Intersect([
        parameters,
        Type.Object({
          status: Type.String({
            description:
              "Required brief operation status in present-progressive form, e.g. 'fetching data', 'reading files'.",
          }),
        }),
      ]),
    });
  }

  pi.registerTool({
    name: 'showFile',
    label: 'showFile',
    description:
      'Signal the host to upload a sandbox file to Slack once it is ready.',
    parameters: Type.Object({
      path: Type.String({
        description:
          'Absolute path to the file in sandbox, e.g. /home/daytona/output/result.png',
      }),
      title: Type.Optional(
        Type.String({
          description: 'Optional title to display in Slack',
        })
      ),
      status: Type.String({
        description:
          "Required brief operation status in present-progressive form, e.g. 'uploading file'.",
      }),
    }),
    execute(_toolCallId, { path, title }) {
      if (!nodePath.isAbsolute(path)) {
        throw new Error('showFile.path must be absolute');
      }

      if (!fs.existsSync(path)) {
        throw new Error(`File not found: ${path}`);
      }

      const stat = fs.statSync(path);
      if (!stat.isFile()) {
        throw new Error(`Path is not a file: ${path}`);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Queued upload for ${path}`,
          },
        ],
        details: {
          path,
          title: title ?? null,
        },
      };
    },
  });
}
