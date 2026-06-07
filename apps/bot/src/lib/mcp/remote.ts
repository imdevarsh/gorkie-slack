import {
  createMCPClient,
  type ListToolsResult,
  type MCPClient,
} from '@ai-sdk/mcp';
import {
  ensureMCPToolModes,
  getMCPConnection,
  getMCPToolModes,
  listEnabledMCPServers,
  updateMCPServer,
} from '@repo/db/queries';
import type {
  MCPOAuthConnection,
  MCPServer,
  MCPToolMode,
} from '@repo/db/schema';
import { errorMessage } from '@repo/utils/error';
import { clampText } from '@repo/utils/text';
import type { ToolExecutionOptions, ToolSet } from 'ai';
import { mcp } from '@/config';
import { createTask, finishTask } from '@/lib/ai/utils/task';
import logger from '@/lib/logger';
import type { SlackMessageContext, Stream } from '@/types';
import { getContextId } from '@/utils/context';
import { decrypt } from './encryption';
import { guardedMCPFetch } from './guarded-fetch';
import { createMCPOAuthProvider } from './oauth-provider';

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
    return text || (JSON.stringify(result) ?? String(result));
  }
  return JSON.stringify(result) ?? String(result);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return slug || 'server';
}

const defaultToolMode: MCPToolMode =
  mcp.defaultToolMode === 'allow' || mcp.defaultToolMode === 'block'
    ? mcp.defaultToolMode
    : 'ask';

export type MCPCredential =
  | { type: 'bearer'; token: string }
  | { type: 'oauth'; connection: MCPOAuthConnection };

export async function getMCPCredential({
  bearerToken,
  server,
  userId,
}: {
  bearerToken?: string;
  server: MCPServer;
  userId: string;
}): Promise<MCPCredential | null> {
  if (server.authType === 'bearer' && bearerToken) {
    return { type: 'bearer', token: bearerToken };
  }

  const result = await getMCPConnection({
    authType: server.authType,
    serverId: server.id,
    userId,
  });
  if (result?.authType === 'bearer') {
    const token = result.connection.token;
    return token ? { type: 'bearer', token: decrypt(token) } : null;
  }
  return result?.authType === 'oauth'
    ? { type: 'oauth', connection: result.connection }
    : null;
}

function openMCPClient({
  credential,
  server,
}: {
  credential: MCPCredential;
  server: MCPServer;
}) {
  const auth =
    credential.type === 'bearer'
      ? { headers: { Authorization: `Bearer ${credential.token}` } }
      : {
          authProvider: createMCPOAuthProvider({
            connection: credential.connection,
            server,
          }),
        };

  return createMCPClient({
    clientName: 'gorkie',
    transport: {
      ...auth,
      fetch: guardedMCPFetch,
      redirect: 'error',
      type: server.transport === 'sse' ? 'sse' : 'http',
      url: server.url,
    },
  });
}

export async function fetchTools({
  credential,
  server,
}: {
  credential: MCPCredential;
  server: MCPServer;
}): Promise<ListToolsResult> {
  const client = await openMCPClient({ credential, server });
  try {
    return await client.listTools();
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function syncMCPToolModes({
  server,
  teamId,
  userId,
}: {
  server: MCPServer;
  teamId?: string | null;
  userId: string;
}) {
  const credential = await getMCPCredential({ server, userId });
  if (!credential) {
    throw new Error('Connect this MCP server before using its tools.');
  }
  const definitions = await fetchTools({ credential, server });
  const modes = await ensureMCPToolModes({
    defaultMode: defaultToolMode,
    serverId: server.id,
    teamId,
    toolNames: definitions.tools.map((definition) => definition.name),
    userId,
  });
  return { definitions, modes };
}

export async function createMCPToolset({
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

  const ctxId = getContextId(context);
  const servers = await listEnabledMCPServers({
    userId,
  });
  const clients: MCPClient[] = [];
  const tools: ToolSet = {};
  const usedNames = new Set<string>();

  for (const server of servers) {
    try {
      const credential = await getMCPCredential({ server, userId });
      if (!credential) {
        continue;
      }

      const client = await openMCPClient({ credential, server });

      let definitions: Awaited<ReturnType<typeof client.listTools>>;
      try {
        definitions = await client.listTools();
      } catch (err) {
        await client.close().catch(() => undefined);
        throw err;
      }
      clients.push(client);
      const threadTs = context.event.thread_ts ?? context.event.ts;
      await ensureMCPToolModes({
        defaultMode: defaultToolMode,
        serverId: server.id,
        teamId: context.teamId,
        toolNames: definitions.tools.map((definition) => definition.name),
        userId,
      });
      const modes = await getMCPToolModes({
        serverId: server.id,
        threadTs,
        userId,
      });
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
        const globalMode = modes.global[toolName] ?? defaultToolMode;
        const mode =
          globalMode === 'block'
            ? 'block'
            : (modes.thread[toolName] ?? globalMode);
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
                  const startedAt = Date.now();
                  const details = clampText(
                    `Input:\n${JSON.stringify(input, null, 2)}`,
                    mcp.taskOutputMaxChars
                  );
                  logger.info(
                    {
                      ctxId,
                      exposedName,
                      input: details,
                      mode,
                      serverId: server.id,
                      serverName: server.name,
                      toolCallId: options.toolCallId,
                      toolName,
                    },
                    '[mcp] Tool started'
                  );

                  if (mode === 'block') {
                    const message = `Access denied by MCP settings for ${server.name}: ${toolName}.`;
                    logger.warn(
                      {
                        ctxId,
                        durationMs: Date.now() - startedAt,
                        exposedName,
                        mode,
                        serverId: server.id,
                        serverName: server.name,
                        toolCallId: options.toolCallId,
                        toolName,
                      },
                      '[mcp] Tool blocked'
                    );
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
                    const output = clampText(
                      `Output:\n${extractResultText(result)}`,
                      mcp.taskOutputMaxChars
                    );
                    logger.info(
                      {
                        ctxId,
                        durationMs: Date.now() - startedAt,
                        exposedName,
                        mode,
                        output,
                        serverId: server.id,
                        serverName: server.name,
                        toolCallId: options.toolCallId,
                        toolName,
                      },
                      '[mcp] Tool completed'
                    );
                    await finishTask(stream, {
                      taskId: options.toolCallId,
                      status: 'complete',
                      output,
                    });
                    return result;
                  } catch (error) {
                    const output = clampText(
                      `Output:\n${errorMessage(error)}`,
                      mcp.taskOutputMaxChars
                    );
                    logger.error(
                      {
                        err: error,
                        ctxId,
                        durationMs: Date.now() - startedAt,
                        exposedName,
                        mode,
                        output,
                        serverId: server.id,
                        serverName: server.name,
                        toolCallId: options.toolCallId,
                        toolName,
                      },
                      '[mcp] Tool failed'
                    );
                    await finishTask(stream, {
                      taskId: options.toolCallId,
                      status: 'error',
                      output,
                    });
                    throw error;
                  }
                },
              }
            : tool;
      }

      await updateMCPServer({
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
