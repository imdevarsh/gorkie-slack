import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
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
import { formatToolInput } from '@/lib/ai/utils/tool-input';
import logger from '@/lib/logger';
import type { SlackMessageContext, Stream } from '@/types';
import { guardedMcpFetch } from './guarded-fetch';
import { createMcpOAuthProvider } from './oauth-provider';

function extractResultText(result: unknown): string {
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
    return text || JSON.stringify(result);
  }
  return JSON.stringify(result);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return slug || 'server';
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

async function getMcpConnection({
  server,
  userId,
}: {
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

  return {
    bearerConnection,
    hasCredentials: isBearer
      ? Boolean(bearerConnection?.token)
      : Boolean(oauthConnection?.tokens),
    oauthConnection,
  };
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
      fetch: guardedMcpFetch,
      redirect: 'error',
      type: server.transport === 'sse' ? 'sse' : 'http',
      url: server.url,
    },
  });
}

async function listTools({
  bearerToken,
  server,
  userId,
}: {
  bearerToken?: string;
  server: McpServer;
  userId: string;
}) {
  const isBearer = server.authType === 'bearer';
  const { bearerConnection, hasCredentials, oauthConnection } =
    await getMcpConnection({
      server,
      userId,
    });
  if (!(bearerToken || hasCredentials)) {
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
    return client.listTools();
  } finally {
    await client.close();
  }
}

export async function syncMcpPermissions({
  server,
  teamId,
  userId,
}: {
  server: McpServer;
  teamId?: string | null;
  userId: string;
}) {
  const definitions = await listTools({ server, userId });
  const permissions = await ensureMcpToolPermissions({
    serverId: server.id,
    teamId,
    userId,
    tools: definitions.tools.map((definition) => ({
      mode: mcp.defaultToolMode,
      toolName: definition.name,
    })),
  });
  return { definitions, permissions };
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
    userId,
  });
  const clients: MCPClient[] = [];
  const tools: ToolSet = {};
  const usedNames = new Set<string>();

  for (const server of servers) {
    try {
      const { bearerConnection, hasCredentials, oauthConnection } =
        await getMcpConnection({
          server,
          userId,
        });
      if (!hasCredentials) {
        continue;
      }

      const client = await openMcpClient({
        bearerConnection,
        oauthConnection,
        server,
      });
      clients.push(client);

      const definitions = await client.listTools();
      const threadTs = context.event.thread_ts ?? context.event.ts;
      await ensureMcpToolPermissions({
        serverId: server.id,
        teamId: context.teamId,
        userId,
        tools: definitions.tools.map((definition) => ({
          mode: mcp.defaultToolMode,
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
        let exposedName = baseName;
        let collision = 2;
        while (usedNames.has(exposedName)) {
          exposedName = `${baseName}_${collision}`;
          collision += 1;
        }
        usedNames.add(exposedName);

        const execute = tool.execute;
        const taskTitle = `Using ${server.name}: ${toolName}`;
        const threadPermission = permissionByTool.get(`thread:${toolName}`);
        const globalPermission = permissionByTool.get(`global:${toolName}`);
        const mode = normalizeToolMode(
          threadPermission?.mode ??
            globalPermission?.mode ??
            mcp.defaultToolMode
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
                    const message = `Access denied by MCP settings for ${server.name}: ${toolName}.`;
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
                    await finishTask(stream, {
                      taskId: options.toolCallId,
                      status: 'complete',
                      output: clampText(
                        `Output:\n${extractResultText(result)}`,
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
