import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../index';
import {
  type MCPToolMode,
  type MCPToolModeMap,
  type MCPToolModesRow,
  mcpToolModes,
} from '../../schema';

// Tool permissions are global per (user, server). The scope/threadTs columns
// remain in the schema (dropping them is a separate migration) but are always
// written as 'global'/'' and only the global row is ever read.
interface SetMCPToolModesInput {
  modes: MCPToolModeMap;
  serverId: string;
  userId: string;
}

export async function getMCPToolModes({
  serverId,
  userId,
}: {
  serverId: string;
  userId: string;
}): Promise<MCPToolModeMap> {
  const rows = await db
    .select()
    .from(mcpToolModes)
    .where(
      and(
        eq(mcpToolModes.serverId, serverId),
        eq(mcpToolModes.userId, userId),
        eq(mcpToolModes.scope, 'global'),
        eq(mcpToolModes.threadTs, '')
      )
    );
  return rows[0]?.modes ?? {};
}

export async function setMCPToolModes(
  input: SetMCPToolModesInput
): Promise<MCPToolModesRow | null> {
  const values = {
    modes: input.modes,
    scope: 'global' as const,
    serverId: input.serverId,
    threadTs: '',
    userId: input.userId,
  };
  const rows = await db
    .insert(mcpToolModes)
    .values(values)
    .onConflictDoUpdate({
      target: [
        mcpToolModes.serverId,
        mcpToolModes.userId,
        mcpToolModes.scope,
        mcpToolModes.threadTs,
      ],
      set: {
        modes: values.modes,
        updatedAt: new Date(),
      },
    })
    .returning();
  return rows[0] ?? null;
}

export async function patchMCPToolModes(input: SetMCPToolModesInput) {
  const values = {
    modes: input.modes,
    scope: 'global' as const,
    serverId: input.serverId,
    threadTs: '',
    userId: input.userId,
  };
  const rows = await db
    .insert(mcpToolModes)
    .values(values)
    .onConflictDoUpdate({
      target: [
        mcpToolModes.serverId,
        mcpToolModes.userId,
        mcpToolModes.scope,
        mcpToolModes.threadTs,
      ],
      set: {
        modes: sql`${mcpToolModes.modes} || ${JSON.stringify(input.modes)}::jsonb`,
        updatedAt: new Date(),
      },
    })
    .returning();
  return rows[0] ?? null;
}

export async function ensureMCPToolModes({
  defaultMode,
  serverId,
  toolNames,
  userId,
}: {
  defaultMode: MCPToolMode;
  serverId: string;
  toolNames: string[];
  userId: string;
}): Promise<MCPToolModeMap> {
  const current = await getMCPToolModes({ serverId, userId });
  const next: MCPToolModeMap = {};
  for (const toolName of toolNames) {
    next[toolName] = current[toolName] ?? defaultMode;
  }

  // Skip the upsert when nothing changed: same set of tools (a pruned or added
  // tool changes the key count) and the same mode for each. Compare by next's
  // keys so duplicate toolNames can't skew the count.
  const nextKeys = Object.keys(next);
  const unchanged =
    nextKeys.length === Object.keys(current).length &&
    nextKeys.every((toolName) => current[toolName] === next[toolName]);
  if (unchanged) {
    return next;
  }

  await setMCPToolModes({
    modes: next,
    serverId,
    userId,
  });
  return next;
}

export function deleteAllMCPToolModes({
  serverId,
  userId,
}: {
  serverId: string;
  userId: string;
}) {
  return db
    .delete(mcpToolModes)
    .where(
      and(eq(mcpToolModes.serverId, serverId), eq(mcpToolModes.userId, userId))
    );
}
