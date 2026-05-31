import { createHash } from 'node:crypto';
import {
  createMCPClient,
  type ListToolsResult,
  type MCPClient,
} from '@ai-sdk/mcp';
import {
  getMcpOAuthConnection,
  listEnabledMcpServersByUser,
  updateMcpServerForUser,
} from '@repo/db/queries';
import type { McpServer } from '@repo/db/schema';
import { decryptSecret } from '@repo/utils';
import type { ToolSet } from 'ai';
import { mcp } from '@/config';
import { env } from '@/env';
import logger from '@/lib/logger';
import type { SlackMessageContext } from '@/types';
import { guardedMcpFetch } from './guarded-fetch';
import { createMcpOAuthProvider } from './oauth-provider';

const blockedToolPattern =
  /\b(delete|destroy|drop|remove|revoke|terminate|kill|shutdown|purchase|buy|charge|pay|transfer|withdraw|send_money)\b/i;

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return slug || 'server';
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

    const searchable = `${tool.name} ${tool.description ?? ''}`;
    if (blockedToolPattern.test(searchable)) {
      continue;
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

export async function createRemoteMcpToolset({
  context,
}: {
  context: SlackMessageContext;
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
      const connection = await getMcpOAuthConnection({
        serverId: server.id,
        userId,
      });
      const isBearer = server.authType === 'bearer';
      if (!(isBearer ? server.bearerToken : connection?.tokensJson)) {
        await updateMcpServerForUser({
          id: server.id,
          userId,
          values: {
            enabled: false,
            lastError: isBearer
              ? 'Bearer token required before tools can be used.'
              : 'OAuth connection required before tools can be used.',
          },
        });
        continue;
      }

      const headers = isBearer
        ? {
            Authorization: `Bearer ${decryptSecret({
              encrypted: server.bearerToken ?? '',
              secret: env.MCP_TOKEN_ENCRYPTION_KEY,
            })}`,
          }
        : undefined;
      const client = await createMCPClient({
        clientName: 'gorkie',
        transport: {
          ...(isBearer
            ? { headers }
            : { authProvider: createMcpOAuthProvider({ connection, server }) }),
          fetch: guardedMcpFetch as typeof fetch,
          redirect: 'error',
          type: server.transport === 'sse' ? 'sse' : 'http',
          url: server.url,
        },
      });
      clients.push(client);

      const definitions = filterToolDefinitions({
        definitions: await client.listTools(),
        server,
      });
      const serverTools = client.toolsFromDefinitions(definitions);
      const serverSlug = slugify(server.name);

      for (const [toolName, tool] of Object.entries(serverTools)) {
        const baseName = `mcp_${serverSlug}_${slugify(toolName)}`;
        const exposedName = usedNames.has(baseName)
          ? `${baseName}_${shortId(`${server.id}:${toolName}`)}`
          : baseName;
        usedNames.add(exposedName);
        tools[exposedName] = tool;
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
      await updateMcpServerForUser({
        id: server.id,
        userId,
        values: {
          lastError:
            error instanceof Error ? error.message : 'MCP server failed',
        },
      });
    }
  }

  return {
    cleanup: async () => {
      await Promise.allSettled(clients.map((client) => client.close()));
    },
    tools,
  };
}
