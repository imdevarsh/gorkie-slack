import { randomUUID } from 'node:crypto';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export type McpToolMode = 'allow' | 'ask' | 'block';
export type McpToolModeMap = Record<string, McpToolMode>;

export const mcpServers = pgTable(
  'mcp_servers',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    teamId: text('team_id'),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    transport: text('transport').notNull(),
    authType: text('auth_type').notNull().default('oauth'),
    url: text('url').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('mcp_servers_user_idx').on(table.userId),
    index('mcp_servers_enabled_idx').on(table.userId, table.enabled),
  ]
);

export const mcpBearerConnections = pgTable(
  'mcp_bearer_connections',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    serverId: text('server_id')
      .notNull()
      .references(() => mcpServers.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    teamId: text('team_id'),
    token: text('token'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('mcp_bearer_connections_server_user_idx').on(
      table.serverId,
      table.userId
    ),
  ]
);

export const mcpOauthConnections = pgTable(
  'mcp_oauth_connections',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    serverId: text('server_id')
      .notNull()
      .references(() => mcpServers.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    teamId: text('team_id'),
    clientId: text('client_id'),
    tokens: text('tokens'),
    clientInformation: text('client_information'),
    codeVerifier: text('code_verifier'),
    state: text('state'),
    scopes: text('scopes'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('mcp_oauth_connections_server_user_idx').on(
      table.serverId,
      table.userId
    ),
  ]
);

export const mcpToolPermissions = pgTable(
  'mcp_tool_permissions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    serverId: text('server_id')
      .notNull()
      .references(() => mcpServers.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    teamId: text('team_id'),
    scope: text('scope').notNull().default('global'),
    threadTs: text('thread_ts').notNull().default(''),
    modes: jsonb('modes').$type<McpToolModeMap>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('mcp_tool_permissions_unique_idx').on(
      table.serverId,
      table.userId,
      table.scope,
      table.threadTs
    ),
    index('mcp_tool_permissions_server_user_idx').on(
      table.serverId,
      table.userId
    ),
  ]
);

export const mcpToolApprovals = pgTable(
  'mcp_tool_approvals',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    approvalId: text('approval_id').notNull(),
    serverId: text('server_id')
      .notNull()
      .references(() => mcpServers.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    teamId: text('team_id'),
    channelId: text('channel_id').notNull(),
    threadTs: text('thread_ts').notNull(),
    eventTs: text('event_ts').notNull(),
    messageTs: text('message_ts'),
    toolName: text('tool_name').notNull(),
    toolCallId: text('tool_call_id').notNull(),
    args: text('args'),
    state: text('state').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('mcp_tool_approvals_approval_idx').on(table.approvalId),
    index('mcp_tool_approvals_user_status_idx').on(table.userId, table.status),
  ]
);

export type McpServer = typeof mcpServers.$inferSelect;
export type NewMcpServer = typeof mcpServers.$inferInsert;
export type McpBearerConnection = typeof mcpBearerConnections.$inferSelect;
export type NewMcpBearerConnection = typeof mcpBearerConnections.$inferInsert;
export type McpOauthConnection = typeof mcpOauthConnections.$inferSelect;
export type NewMcpOauthConnection = typeof mcpOauthConnections.$inferInsert;
export type McpToolPermission = typeof mcpToolPermissions.$inferSelect;
export type NewMcpToolPermission = typeof mcpToolPermissions.$inferInsert;
export type McpToolApproval = typeof mcpToolApprovals.$inferSelect;
export type NewMcpToolApproval = typeof mcpToolApprovals.$inferInsert;
