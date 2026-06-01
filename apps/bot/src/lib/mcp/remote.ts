import { createHash } from 'node:crypto';
import {
  createMCPClient,
  type ListToolsResult,
  type MCPClient,
} from '@ai-sdk/mcp';
import {
  ensureMcpToolPermissions,
  getMcpBearerConnection,
  getMcpOAuthConnection,
  listEnabledMcpServersByUser,
  listMcpToolPermissions,
  updateMcpServerForUser,
} from '@repo/db/queries';
import type { McpServer } from '@repo/db/schema';
import { decryptSecret } from '@repo/utils';
import { errorMessage } from '@repo/utils/error';
import { clampText } from '@repo/utils/text';
import type { ToolExecutionOptions, ToolSet } from 'ai';
import { mcp } from '@/config';
import { env } from '@/env';
import { createTask, finishTask } from '@/lib/ai/utils/task';
import logger from '@/lib/logger';
import type { SlackMessageContext, Stream } from '@/types';
import { formatToolInput } from './format-tool-input';
import { guardedMcpFetch } from './guarded-fetch';
import { createMcpOAuthProvider } from './oauth-provider';

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return slug || 'server';
}

function defaultToolMode(): 'ask' {
  return 'ask';
}

function normalizeToolMode(mode?: string | null): 'allow' | 'ask' | 'block' {
  if (mode === 'allow' || mode === 'auto') {
    return 'allow';
  }
  if (mode === 'block') {
    return 'block';
  }
  return 'ask';
}

function shortId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

function filterToolDefinitions({
  definitions,
  server,
}: {
  definitions: ListToolsResult;
  server: McpServer;
}): ListToolsResult {
  let schemaBytes = 0;
  const tools: ListToolsResult['tools'] = [];

  for (const tool of definitions.tools) {
    if (tools.length >= mcp.maxToolsPerServer) {
      break;
    }

    const nextSchemaBytes = Buffer.byteLength(
      JSON.stringify(tool.inputSchema ?? {}),
      'utf8'
    );
    if (schemaBytes + nextSchemaBytes > mcp.maxSchemaBytesPerServer) {
      break;
    }

    schemaBytes += nextSchemaBytes;
    tools.push(tool);
  }

  if (tools.length !== definitions.tools.length) {
    logger.info(
      {
        kept: tools.length,
        serverId: server.id,
        total: definitions.tools.length,
      },
      'Filtered MCP tools'
    );
  }

  return { ...definitions, tools };
}

function openMcpClient({
  bearerConnection,
  bearerToken,
  oauthConnection,
  server,
}: {
  bearerConnection?: Awaited<ReturnType<typeof getMcpBearerConnection>>;
  bearerToken?: string;
  oauthConnection?: Awaited<ReturnType<typeof getMcpOAuthConnection>>;
  server: McpServer;
}) {
  const isBearer = server.authType === 'bearer';
  const headers = isBearer
    ? {
        Authorization: `Bearer ${
          bearerToken ??
          decryptSecret({
            encrypted: bearerConnection?.token ?? '',
            secret: env.MCP_TOKEN_ENCRYPTION_KEY,
          })
        }`,
      }
    : undefined;

  return createMCPClient({
    clientName: 'gorkie',
    transport: {
      ...(isBearer
        ? { headers }
        : {
            authProvider: createMcpOAuthProvider({
              connection: oauthConnection ?? null,
              server,
            }),
          }),
      fetch: guardedMcpFetch as typeof fetch,
      redirect: 'error',
      type: server.transport === 'sse' ? 'sse' : 'http',
      url: server.url,
    },
  });
}

async function listMcpToolDefinitions({
  bearerToken,
  server,
  userId,
}: {
  bearerToken?: string;
  server: McpServer;
  userId: string;
}) {
  const isBearer = server.authType === 'bearer';
  const bearerConnection = isBearer
    ? await getMcpBearerConnection({
        serverId: server.id,
        userId,
      })
    : null;
  const oauthConnection = isBearer
    ? null
    : await getMcpOAuthConnection({
        serverId: server.id,
        userId,
      });
  if (
    !(isBearer
      ? bearerToken || bearerConnection?.token
      : oauthConnection?.tokens)
  ) {
    throw new Error(
      isBearer
        ? 'Bearer token required before tools can be used.'
        : 'OAuth connection required before tools can be used.'
    );
  }

  const client = await openMcpClient({
    bearerConnection,
    bearerToken,
    oauthConnection,
    server,
  });
  try {
    return filterToolDefinitions({
      definitions: await client.listTools(),
      server,
    });
  } finally {
    await client.close();
  }
}

export function validateMcpServerTools({
  bearerToken,
  server,
  userId,
}: {
  bearerToken?: string;
  server: McpServer;
  userId: string;
}) {
  return listMcpToolDefinitions({ bearerToken, server, userId });
}

export async function syncMcpToolPermissions({
  server,
  teamId,
  userId,
}: {
  server: McpServer;
  teamId?: string | null;
  userId: string;
}) {
  const definitions = await listMcpToolDefinitions({ server, userId });
  return ensureMcpToolPermissions({
    serverId: server.id,
    teamId,
    userId,
    tools: definitions.tools.map((definition) => ({
      mode: defaultToolMode(),
      toolName: definition.name,
    })),
  });
}

export async function createMcpToolset({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}): Promise<{ cleanup: () => Promise<void>; tools: ToolSet }> {
  const userId = context.event.user;
  if (!userId) {
    return { cleanup: async () => undefined, tools: {} };
  }

  const servers = await listEnabledMcpServersByUser({
    limit: mcp.maxServersPerRequest,
    userId,
  });
  const clients: MCPClient[] = [];
  const tools: ToolSet = {};
  const usedNames = new Set<string>();

  for (const server of servers) {
    try {
      const isBearer = server.authType === 'bearer';
      const bearerConnection = isBearer
        ? await getMcpBearerConnection({
            serverId: server.id,
            userId,
          })
        : null;
      const oauthConnection = isBearer
        ? null
        : await getMcpOAuthConnection({
            serverId: server.id,
            userId,
          });
      if (!(isBearer ? bearerConnection?.token : oauthConnection?.tokens)) {
        continue;
      }

      const client = await openMcpClient({
        bearerConnection,
        oauthConnection,
        server,
      });
      clients.push(client);

      const definitions = filterToolDefinitions({
        definitions: await client.listTools(),
        server,
      });
      const threadTs = context.event.thread_ts ?? context.event.ts;
      await ensureMcpToolPermissions({
        serverId: server.id,
        teamId: context.teamId,
        userId,
        tools: definitions.tools.map((definition) => ({
          mode: defaultToolMode(),
          toolName: definition.name,
        })),
      });
      const permissions = await listMcpToolPermissions({
        serverId: server.id,
        threadTs,
        userId,
      });
      const permissionByTool = new Map(
        permissions.map((permission) => [
          `${permission.scope}:${permission.toolName}`,
          permission,
        ])
      );
      const serverTools = client.toolsFromDefinitions(definitions);
      const serverSlug = slugify(server.name);

      for (const [toolName, tool] of Object.entries(serverTools)) {
        const baseName = `mcp_${serverSlug}_${slugify(toolName)}`;
        const exposedName = usedNames.has(baseName)
          ? `${baseName}_${shortId(`${server.id}:${toolName}`)}`
          : baseName;
        usedNames.add(exposedName);

        const execute = tool.execute;
        const taskTitle = `Using ${server.name}: ${toolName}`;
        const threadPermission = permissionByTool.get(`thread:${toolName}`);
        const globalPermission = permissionByTool.get(`global:${toolName}`);
        const mode = normalizeToolMode(
          threadPermission?.mode ?? globalPermission?.mode ?? defaultToolMode()
        );
        const metadata = {
          mcp: {
            serverId: server.id,
            serverName: server.name,
            toolName,
          },
        };
        tools[exposedName] =
          typeof execute === 'function'
            ? {
                ...tool,
                metadata,
                needsApproval: mode === 'ask',
                onInputStart: tool.onInputStart,
                execute: async (
                  input: unknown,
                  options: ToolExecutionOptions
                ) => {
                  const details = clampText(
                    formatToolInput(input),
                    mcp.taskOutputMaxChars
                  );

                  if (mode === 'block') {
                    const message = 'Tool is blocked by your settings.';
                    await createTask(stream, {
                      taskId: options.toolCallId,
                      title: `Blocked ${server.name}: ${toolName}`,
                      details,
                      status: 'in_progress',
                    });
                    await finishTask(stream, {
                      taskId: options.toolCallId,
                      status: 'complete',
                      output: message,
                    });
                    return {
                      content: [{ type: 'text', text: message }],
                    };
                  }

                  await createTask(stream, {
                    taskId: options.toolCallId,
                    title: taskTitle,
                    details,
                    status: 'in_progress',
                  });

                  try {
                    const result = await execute(input, options);
                    let output = 'Done';
                    if (
                      result &&
                      typeof result === 'object' &&
                      'content' in result &&
                      Array.isArray(result.content)
                    ) {
                      const text = result.content
                        .map((item) =>
                          item &&
                          typeof item === 'object' &&
                          'type' in item &&
                          item.type === 'text' &&
                          'text' in item &&
                          typeof item.text === 'string'
                            ? item.text
                            : ''
                        )
                        .filter(Boolean)
                        .join('\n');
                      if (text) {
                        output = text;
                      }
                    } else {
                      output = JSON.stringify(result);
                    }
                    await finishTask(stream, {
                      taskId: options.toolCallId,
                      status: 'complete',
                      output: clampText(
                        `Output:\n${output}`,
                        mcp.taskOutputMaxChars
                      ),
                    });
                    return result;
                  } catch (error) {
                    await finishTask(stream, {
                      taskId: options.toolCallId,
                      status: 'error',
                      output: clampText(
                        `Output:\n${errorMessage(error)}`,
                        mcp.taskOutputMaxChars
                      ),
                    });
                    throw error;
                  }
                },
              }
            : tool;
      }

      await updateMcpServerForUser({
        id: server.id,
        userId,
        values: { lastConnectedAt: new Date(), lastError: null },
      });
    } catch (error) {
      logger.warn(
        { err: error, serverId: server.id, userId },
        'MCP server failed'
      );
    }
  }

  return {
    cleanup: async () => {
      await Promise.allSettled(clients.map((client) => client.close()));
    },
    tools,
  };
}
