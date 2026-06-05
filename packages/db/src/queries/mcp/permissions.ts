import { and, eq, or } from 'drizzle-orm';
import { db } from '../../index';
import {
  type McpToolMode,
  type McpToolModeMap,
  type McpToolPermission,
  mcpToolPermissions,
} from '../../schema';

export interface McpToolModes {
  global: McpToolModeMap;
  thread: McpToolModeMap;
}

function isMcpToolMode(value: unknown): value is McpToolMode {
  return value === 'allow' || value === 'ask' || value === 'block';
}

function cleanModes(modes: Record<string, unknown>): McpToolModeMap {
  const clean: McpToolModeMap = {};
  for (const [toolName, mode] of Object.entries(modes)) {
    if (isMcpToolMode(mode)) {
      clean[toolName] = mode;
    }
  }
  return clean;
}

export async function getMcpToolModes({
  serverId,
  threadTs,
  userId,
}: {
  serverId: string;
  threadTs?: string | null;
  userId: string;
}): Promise<McpToolModes> {
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

  const result: McpToolModes = { global: {}, thread: {} };
  for (const row of rows) {
    if (row.scope === 'thread') {
      result.thread = cleanModes(row.modes);
    } else {
      result.global = cleanModes(row.modes);
    }
  }
  return result;
}

export async function setMcpToolModes({
  modes,
  scope,
  serverId,
  teamId,
  threadTs,
  userId,
}: {
  modes: McpToolModeMap;
  scope: 'global' | 'thread';
  serverId: string;
  teamId?: string | null;
  threadTs?: string | null;
  userId: string;
}): Promise<McpToolPermission | null> {
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

export async function patchMcpToolModes({
  modes,
  scope,
  serverId,
  teamId,
  threadTs,
  userId,
}: {
  modes: McpToolModeMap;
  scope: 'global' | 'thread';
  serverId: string;
  teamId?: string | null;
  threadTs?: string | null;
  userId: string;
}) {
  const current = await getMcpToolModes({ serverId, threadTs, userId });
  const merged = {
    ...(scope === 'thread' ? current.thread : current.global),
    ...modes,
  };
  return setMcpToolModes({
    modes: merged,
    scope,
    serverId,
    teamId,
    threadTs,
    userId,
  });
}

export async function ensureMcpToolModes({
  defaultMode,
  serverId,
  teamId,
  toolNames,
  userId,
}: {
  defaultMode: McpToolMode;
  serverId: string;
  teamId?: string | null;
  toolNames: string[];
  userId: string;
}): Promise<McpToolModeMap> {
  const current = await getMcpToolModes({ serverId, userId });
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

  await setMcpToolModes({
    modes: next,
    scope: 'global',
    serverId,
    teamId,
    userId,
  });
  return next;
}

export function resetMcpToolModes({
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
