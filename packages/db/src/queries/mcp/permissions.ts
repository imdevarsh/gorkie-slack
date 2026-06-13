import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../index';
import {
  type MCPToolMode,
  type MCPToolModeMap,
  type MCPToolPermission,
  mcpToolPermissions,
} from '../../schema';

// Tool permissions are global per (user, server). The scope/threadTs columns
// remain in the schema (dropping them is a separate migration) but are always
// written as 'global'/'' and only the global row is ever read.
interface SetMCPToolModesInput {
  modes: MCPToolModeMap;
  serverId: string;
  teamId?: string | null;
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
    .from(mcpToolPermissions)
    .where(
      and(
        eq(mcpToolPermissions.serverId, serverId),
        eq(mcpToolPermissions.userId, userId),
        eq(mcpToolPermissions.scope, 'global'),
        eq(mcpToolPermissions.threadTs, '')
      )
    );
  return rows[0]?.modes ?? {};
}

export async function setMCPToolModes(
  input: SetMCPToolModesInput
): Promise<MCPToolPermission | null> {
  const values = {
    modes: input.modes,
    scope: 'global' as const,
    serverId: input.serverId,
    teamId: input.teamId ?? null,
    threadTs: '',
    userId: input.userId,
  };
  const rows = await db
    .insert(mcpToolPermissions)
    .values(values)
    .onConflictDoUpdate({
      target: [
        mcpToolPermissions.serverId,
        mcpToolPermissions.userId,
        mcpToolPermissions.scope,
        mcpToolPermissions.threadTs,
      ],
      set: {
        modes: values.modes,
        teamId: values.teamId,
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
    teamId: input.teamId ?? null,
    threadTs: '',
    userId: input.userId,
  };
  const rows = await db
    .insert(mcpToolPermissions)
    .values(values)
    .onConflictDoUpdate({
      target: [
        mcpToolPermissions.serverId,
        mcpToolPermissions.userId,
        mcpToolPermissions.scope,
        mcpToolPermissions.threadTs,
      ],
      set: {
        modes: sql`${mcpToolPermissions.modes} || ${JSON.stringify(input.modes)}::jsonb`,
        teamId: values.teamId,
        updatedAt: new Date(),
      },
    })
    .returning();
  return rows[0] ?? null;
}

export async function ensureMCPToolModes({
  defaultMode,
  serverId,
  teamId,
  toolNames,
  userId,
}: {
  defaultMode: MCPToolMode;
  serverId: string;
  teamId?: string | null;
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
    teamId,
    userId,
  });
  return next;
}

export function deleteAllMCPToolPermissions({
  serverId,
  userId,
}: {
  serverId: string;
  userId: string;
}) {
  return db
    .delete(mcpToolPermissions)
    .where(
      and(
        eq(mcpToolPermissions.serverId, serverId),
        eq(mcpToolPermissions.userId, userId)
      )
    );
}
