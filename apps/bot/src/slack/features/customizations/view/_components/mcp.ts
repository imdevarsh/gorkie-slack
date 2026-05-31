import type { McpServerWithOAuth } from '@repo/db/queries';
import { formatDistanceToNowStrict } from 'date-fns';
import { Bits, Blocks, Elements } from 'slack-block-builder';
import { appHome } from '@/config';

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function buildMcpServerBlock(server: McpServerWithOAuth) {
  const connected =
    server.authType === 'bearer'
      ? Boolean(server.bearerToken)
      : server.hasOAuthConnection;
  const status = [
    server.transport.toUpperCase(),
    server.authType === 'bearer' ? 'bearer' : 'oauth',
    server.enabled ? 'enabled' : 'disabled',
  ].join(' · ');
  let lastSeen = 'Not connected';
  if (server.lastConnectedAt) {
    lastSeen = `Last connected ${formatDistanceToNowStrict(
      server.lastConnectedAt,
      {
        addSuffix: true,
      }
    )}`;
  } else if (connected) {
    lastSeen = 'Connected';
  }
  const lastError = server.lastError ? `\nError: ${server.lastError}` : '';

  return [
    Blocks.Section({
      text: [
        `*${truncate(server.name, appHome.maxMcpNameDisplay)}*`,
        `\`${truncate(server.url, appHome.maxMcpUrlDisplay)}\``,
        `${status} · ${lastSeen}${lastError}`,
      ].join('\n'),
    }).accessory(
      Elements.Button({
        actionId: server.enabled ? 'home_mcp_disable' : 'home_mcp_enable',
        text: server.enabled ? 'Disable' : 'Enable',
        value: server.id,
      })
    ),
    Blocks.Actions().elements(
      Elements.Button({
        actionId: connected ? 'home_mcp_disconnect' : 'home_mcp_connect',
        text: connected ? 'Disconnect' : 'Connect',
        value: server.id,
      }),
      Elements.Button({
        actionId: 'home_mcp_delete',
        text: 'Delete',
        value: server.id,
      })
        .danger()
        .confirm(
          Bits.ConfirmationDialog({
            confirm: 'Delete',
            deny: 'Keep',
            text: 'This removes the server and stored OAuth credentials.',
            title: 'Delete MCP server?',
          })
        )
    ),
  ];
}

export function mcpBlocks(servers: McpServerWithOAuth[]) {
  return [
    Blocks.Section({ text: `*MCP Servers* (${servers.length})` }).accessory(
      Elements.Button({
        actionId: 'home_mcp_add',
        text: 'Add',
      })
    ),
    servers.flatMap((server) => buildMcpServerBlock(server)),
  ];
}
