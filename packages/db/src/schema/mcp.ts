import { randomUUID } from 'node:crypto';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

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
    bearerToken: text('bearer_token'),
    clientId: text('client_id'),
    enabled: boolean('enabled').notNull().default(false),
    includeToolsJson: text('include_tools_json'),
    excludeToolsJson: text('exclude_tools_json'),
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
    tokensJson: text('tokens_json'),
    clientInformationJson: text('client_information_json'),
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
    uniqueIndex('mcp_oauth_server_user_idx').on(table.serverId, table.userId),
    index('mcp_oauth_state_idx').on(table.state),
  ]
);

export type McpServer = typeof mcpServers.$inferSelect;
export type NewMcpServer = typeof mcpServers.$inferInsert;
export type McpOauthConnection = typeof mcpOauthConnections.$inferSelect;
export type NewMcpOauthConnection = typeof mcpOauthConnections.$inferInsert;
