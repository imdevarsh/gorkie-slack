import fs from 'node:fs';
import nodePath from 'node:path';
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
} from '@earendil-works/pi-coding-agent';
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from '@earendil-works/pi-coding-agent';
import { type Static, type TSchema, Type } from '@sinclair/typebox';

const statusSchema = Type.Object({
  status: Type.Optional(
    Type.String({
      description:
        "Required brief operation status in present-progressive form, e.g. 'fetching data', 'reading files'.",
    })
  ),
});

// biome-ignore lint/suspicious/noExplicitAny: pi bundles its own typebox version; TSchema from each is nominally incompatible despite being structurally equivalent
const withStatus = (schema: any) =>
  Type.Intersect([schema as TSchema, statusSchema]);

function passthrough<TParams extends TSchema, TDetails>(
  tool: {
    parameters: TParams;
    execute: (
      toolCallId: string,
      params: Static<TParams>,
      signal?: AbortSignal,
      onUpdate?: AgentToolUpdateCallback<TDetails>
    ) => Promise<AgentToolResult<TDetails>>;
  },
  normalize?: (params: Static<TParams>) => Static<TParams>
) {
  return (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>
  ) => {
    const parsed = params as Static<TParams>;
    const normalized = normalize ? normalize(parsed) : parsed;
    return tool.execute(toolCallId, normalized, signal, onUpdate);
  };
}

export default function registerToolsExtension(pi: ExtensionAPI): void {
  const cwd = process.cwd();
  // biome-ignore lint/suspicious/noExplicitAny: pi bundles its own typebox version; TSchema from each is nominally incompatible
  const register = (def: any) => pi.registerTool(def);

  const read = createReadTool(cwd);
  const readParams = withStatus(read.parameters);
  register({
    ...read,
    name: 'read',
    parameters: readParams,
    execute: passthrough(read),
  });

  const edit = createEditTool(cwd);
  const editParams = withStatus(edit.parameters);
  register({
    ...edit,
    name: 'edit',
    parameters: editParams,
    execute: passthrough(edit),
  });

  const write = createWriteTool(cwd);
  const writeParams = withStatus(write.parameters);
  register({
    ...write,
    name: 'write',
    parameters: writeParams,
    execute: passthrough(write),
  });

  const find = createFindTool(cwd);
  const findParams = withStatus(find.parameters);
  register({
    ...find,
    name: 'find',
    parameters: findParams,
    execute: passthrough(find),
  });

  const grep = createGrepTool(cwd);
  const grepParams = withStatus(grep.parameters);
  register({
    ...grep,
    name: 'grep',
    parameters: grepParams,
    execute: passthrough(grep),
  });

  const ls = createLsTool(cwd);
  const lsParams = withStatus(ls.parameters);
  register({
    ...ls,
    name: 'ls',
    parameters: lsParams,
    execute: passthrough(ls),
  });

  const bash = createBashTool(cwd);
  const bashParams = withStatus(
    Type.Intersect([
      // biome-ignore lint/suspicious/noExplicitAny: pi-bundled typebox TObject is not assignable to local TObject
      Type.Omit(bash.parameters as any, ['timeout']),
      Type.Object({
        timeout: Type.Optional(
          Type.Number({
            description: 'Timeout in seconds (defaults to 600 seconds).',
            default: 600,
          })
        ),
      }),
    ])
  );
  register({
    ...bash,
    name: 'bash',
    parameters: bashParams,
    execute: passthrough(bash, (rawArgs) => ({
      ...rawArgs,
      timeout:
        typeof rawArgs.timeout === 'number' &&
        Number.isFinite(rawArgs.timeout) &&
        rawArgs.timeout > 0
          ? rawArgs.timeout
          : 600,
    })),
  });

  const showFileParams = withStatus(
    Type.Object({
      path: Type.String({
        description:
          'Absolute path to the file in sandbox, e.g. /home/user/output/result.png',
      }),
      title: Type.Optional(
        Type.String({
          description: 'Optional title to display in Slack',
        })
      ),
    })
  );

  register({
    name: 'showFile',
    label: 'showFile',
    description:
      'Signal the host to upload a sandbox file to Slack once it is ready.',
    parameters: showFileParams,
    execute: (_toolCallId, params) => {
      const { path, title } = params as Static<typeof showFileParams>;

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
