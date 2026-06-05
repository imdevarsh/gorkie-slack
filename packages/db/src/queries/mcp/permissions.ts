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
  const current = await getMCPToolModes({
    serverId: input.serverId,
    threadTs: input.scope === 'thread' ? input.threadTs : null,
    userId: input.userId,
  });
  const merged = {
    ...(input.scope === 'thread' ? current.thread : current.global),
    ...input.modes,
  };
  const next =
    input.scope === 'thread'
      ? {
          modes: merged,
          scope: input.scope,
          serverId: input.serverId,
          teamId: input.teamId,
          threadTs: input.threadTs,
          userId: input.userId,
        }
      : {
          modes: merged,
          scope: input.scope,
          serverId: input.serverId,
          teamId: input.teamId,
          userId: input.userId,
        };
  return setMCPToolModes(next);
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

export function resetGlobalMCPToolModes({
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
