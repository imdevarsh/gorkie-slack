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
    pi.registerTool({
      ...builtIn,
      name: id,
      parameters: Type.Intersect([
        builtIn.parameters,
        Type.Object({
          status: Type.Optional(
            Type.String({
              description: 'Optional progress/status note for the caller UI',
            })
          ),
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
      status: Type.Optional(
        Type.String({
          description: 'Optional progress/status note for the caller UI',
        })
      ),
    }),
    execute(_toolCallId, { path, title }) {
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
