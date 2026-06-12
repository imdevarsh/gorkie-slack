import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '../../index';
import {
  type MCPToolMode,
  type MCPToolModeMap,
  type MCPToolPermission,
  mcpToolPermissions,
} from '../../schema';

export interface MCPToolModes {
  global: MCPToolModeMap;
  thread: MCPToolModeMap;
}

type SetMCPToolModesInput =
  | {
      modes: MCPToolModeMap;
      scope: 'global';
      serverId: string;
      teamId?: string | null;
      userId: string;
    }
  | {
      modes: MCPToolModeMap;
      scope: 'thread';
      serverId: string;
      teamId?: string | null;
      threadTs: string;
      userId: string;
    };

export async function getMCPToolModes({
  serverId,
  threadTs,
  userId,
}: {
  serverId: string;
  threadTs?: string | null;
  userId: string;
}): Promise<MCPToolModes> {
  const rows = await db
    .select()
    .from(mcpToolPermissions)
    .where(
      and(
        eq(mcpToolPermissions.serverId, serverId),
        eq(mcpToolPermissions.userId, userId),
        threadTs
          ? or(
              and(
                eq(mcpToolPermissions.scope, 'global'),
                eq(mcpToolPermissions.threadTs, '')
              ),
              and(
                eq(mcpToolPermissions.scope, 'thread'),
                eq(mcpToolPermissions.threadTs, threadTs)
              )
            )
          : and(
              eq(mcpToolPermissions.scope, 'global'),
              eq(mcpToolPermissions.threadTs, '')
            )
      )
    );

  const result: MCPToolModes = { global: {}, thread: {} };
  for (const row of rows) {
    if (row.scope === 'thread') {
      result.thread = row.modes;
    } else {
      result.global = row.modes;
    }
  }
  return result;
}

export async function setMCPToolModes(
  input: SetMCPToolModesInput
): Promise<MCPToolPermission | null> {
  const values = {
    modes: input.modes,
    scope: input.scope,
    serverId: input.serverId,
    teamId: input.teamId ?? null,
    threadTs: input.scope === 'thread' ? input.threadTs : '',
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
    scope: input.scope,
    serverId: input.serverId,
    teamId: input.teamId ?? null,
    threadTs: input.scope === 'thread' ? input.threadTs : '',
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
    next[toolName] = current.global[toolName] ?? defaultMode;
  }

  // Skip the upsert when nothing changed: same set of tools (a pruned or added
  // tool changes the key count) and the same mode for each. Compare by next's
  // keys so duplicate toolNames can't skew the count.
  const currentGlobal = current.global;
  const nextKeys = Object.keys(next);
  const unchanged =
    nextKeys.length === Object.keys(currentGlobal).length &&
    nextKeys.every((toolName) => currentGlobal[toolName] === next[toolName]);
  if (unchanged) {
    return next;
  }

  await setMCPToolModes({
    modes: next,
    scope: 'global',
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
