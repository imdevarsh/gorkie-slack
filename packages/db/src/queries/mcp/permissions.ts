import { and, eq, or } from 'drizzle-orm';
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

export async function setMCPToolModes({
  modes,
  scope,
  serverId,
  teamId,
  threadTs,
  userId,
}: {
  modes: MCPToolModeMap;
  scope: 'global' | 'thread';
  serverId: string;
  teamId?: string | null;
  threadTs?: string | null;
  userId: string;
}): Promise<MCPToolPermission | null> {
  const values = {
    modes,
    scope,
    serverId,
    teamId: teamId ?? null,
    threadTs: scope === 'thread' ? (threadTs ?? '') : '',
    userId,
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

export async function patchMCPToolModes({
  modes,
  scope,
  serverId,
  teamId,
  threadTs,
  userId,
}: {
  modes: MCPToolModeMap;
  scope: 'global' | 'thread';
  serverId: string;
  teamId?: string | null;
  threadTs?: string | null;
  userId: string;
}) {
  const current = await getMCPToolModes({ serverId, threadTs, userId });
  const merged = {
    ...(scope === 'thread' ? current.thread : current.global),
    ...modes,
  };
  return setMCPToolModes({
    modes: merged,
    scope,
    serverId,
    teamId,
    threadTs,
    userId,
  });
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
  const next = { ...current.global };
  let changed = false;

  for (const toolName of toolNames) {
    if (!next[toolName]) {
      next[toolName] = defaultMode;
      changed = true;
    }
  }

  if (!changed) {
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

export function resetMCPToolModes({
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
        eq(mcpToolPermissions.userId, userId),
        eq(mcpToolPermissions.scope, 'global'),
        eq(mcpToolPermissions.threadTs, '')
      )
    );
}
