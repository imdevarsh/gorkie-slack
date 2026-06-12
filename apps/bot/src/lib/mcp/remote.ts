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
import type { ToolSet } from 'ai';
import { mcp } from '@/config';
import logger from '@/lib/logger';
import type { SlackMessageContext, Stream } from '@/types';
import { getContextId } from '@/utils/context';
import { decrypt } from './encryption';
import { formatToolName } from './format-tool-name';
import { guardedMCPFetch } from './guarded-fetch';
import { createMCPOAuthProvider } from './oauth-provider';
import { wrapMCPToolExecute } from './wrapper';

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return slug || 'server';
}

export const defaultToolMode: MCPToolMode =
  mcp.defaultToolMode === 'allow' || mcp.defaultToolMode === 'block'
    ? mcp.defaultToolMode
    : 'ask';

// Keeps the App Home "Active" freshness within this window while removing a
// lastConnectedAt write from every message.
const CONNECTED_AT_REFRESH_MS = 5 * 60 * 1000;

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
  const threadTs = context.event.thread_ts ?? context.event.ts;
  const servers = await listEnabledMCPServers({
    userId,
  });

  // Phase A (concurrent): per-server I/O. Each closure owns its errors and
  // returns null on failure so one bad server doesn't abort the others. No
  // shared state is mutated here, so the order servers resolve in is irrelevant.
  const setups = await Promise.all(
    servers.map(async (server) => {
      try {
        const credential = await getMCPCredential({ server, userId });
        if (!credential) {
          return null;
        }

        const client = await openMCPClient({ credential, server });

        let definitions: Awaited<ReturnType<typeof client.listTools>>;
        try {
          definitions = await client.listTools();
        } catch (err) {
          await client.close().catch(() => undefined);
          throw err;
        }

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

        const needsTouch =
          server.lastError !== null ||
          !server.lastConnectedAt ||
          Date.now() - server.lastConnectedAt.getTime() >
            CONNECTED_AT_REFRESH_MS;
        if (needsTouch) {
          await updateMCPServer({
            id: server.id,
            userId,
            values: { lastConnectedAt: new Date(), lastError: null },
          });
        }

        return { client, definitions, modes, server };
      } catch (error) {
        logger.warn(
          { err: error, serverId: server.id, userId },
          'MCP server failed'
        );
        return null;
      }
    })
  );

  // Phase B (serial): assemble tools in the original servers order so exposed
  // names stay deterministic across messages regardless of resolution order.
  const clients: MCPClient[] = [];
  const tools: ToolSet = {};
  const usedNames = new Set<string>();

  for (const setup of setups) {
    if (!setup) {
      continue;
    }
    const { client, definitions, modes, server } = setup;
    clients.push(client);
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
      const taskTitle = `Using ${server.name}: ${formatToolName(toolName)}`;
      const globalMode = modes.global[toolName] ?? defaultToolMode;
      const mode =
        globalMode === 'block'
          ? 'block'
          : (modes.thread[toolName] ?? globalMode);
      const metadata = {
        mcp: {
          server: { id: server.id, name: server.name },
          tool: { name: toolName, exposedName },
        },
      };
      tools[exposedName] =
        typeof execute === 'function'
          ? {
              ...tool,
              metadata,
              needsApproval: mode === 'ask',
              onInputStart: tool.onInputStart,
              execute: wrapMCPToolExecute({
                ctxId,
                execute,
                exposedName,
                mode,
                server,
                stream,
                taskTitle,
                toolName,
              }),
            }
          : tool;
    }
  }

  return {
    cleanup: async () => {
      await Promise.allSettled(clients.map((client) => client.close()));
    },
    tools,
  };
}
