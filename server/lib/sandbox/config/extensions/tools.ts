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
  type ToolDefinition,
} from '@mariozechner/pi-coding-agent';
import { type Static, type TSchema, Type } from '@sinclair/typebox';

const DEFAULT_BASH_TIMEOUT_SECONDS = 2 * 60;
const statusParameter = Type.Object({
  status: Type.String({
    description:
      "Required brief operation status in present-progressive form, e.g. 'fetching data', 'reading files'.",
  }),
});

function withStatus<TParams extends TSchema>(params: TParams) {
  return Type.Intersect([params, statusParameter]);
}

function registerBuiltInTool<TParams extends TSchema, TDetails>(
  pi: ExtensionAPI,
  id: string,
  tool: ToolDefinition<TParams, TDetails>,
  paramsOverride?: TSchema
): void {
  const baseParameters = paramsOverride ?? tool.parameters;
  const parameters = withStatus(baseParameters);

  const definition: ToolDefinition<typeof parameters, TDetails> = {
    ...tool,
    name: id,
    parameters,
    execute: (toolCallId, params, signal, onUpdate, ctx) => {
      const { status: _status, ...args } = params as Static<
        typeof parameters
      > & { status: string };
      return tool.execute(
        toolCallId,
        args as Static<TParams>,
        signal,
        onUpdate,
        ctx
      );
    },
  };

  pi.registerTool(definition);
}

export default function registerToolsExtension(pi: ExtensionAPI) {
  const cwd = process.cwd();

  registerBuiltInTool(pi, 'read', createReadTool(cwd));
  registerBuiltInTool(pi, 'edit', createEditTool(cwd));
  registerBuiltInTool(pi, 'write', createWriteTool(cwd));
  registerBuiltInTool(pi, 'find', createFindTool(cwd));
  registerBuiltInTool(pi, 'grep', createGrepTool(cwd));
  registerBuiltInTool(pi, 'ls', createLsTool(cwd));

  const bash = createBashTool(cwd);
  const bashParameters = Type.Intersect([
    Type.Omit(bash.parameters, ['timeout']),
    Type.Object({
      timeout: Type.Optional(
        Type.Number({
          description: 'Timeout in seconds (defaults to 120 seconds).',
          default: DEFAULT_BASH_TIMEOUT_SECONDS,
        })
      ),
    }),
  ]);
  registerBuiltInTool(pi, 'bash', bash, bashParameters);

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

      return Promise.resolve({
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
      });
    },
  });
}
