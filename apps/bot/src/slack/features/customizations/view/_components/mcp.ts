import type { McpServerWithOAuth } from '@repo/db/queries';
import { Bits, Blocks, Elements } from 'slack-block-builder';
import { appHome } from '@/config';
import { actions } from '../../mcp/ids';

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function serverBlocks(server: McpServerWithOAuth) {
  const connected =
    server.authType === 'bearer'
      ? Boolean(server.bearerToken)
      : server.hasOAuthConnection;
  let authStatus = 'OAuth required';
  if (server.authType === 'bearer') {
    authStatus = connected ? 'Bearer token set' : 'Bearer token required';
  } else if (connected) {
    authStatus = 'OAuth connected';
  }
  const status = `${server.enabled ? 'Enabled' : 'Disabled'} · ${authStatus}`;
  const lastError = server.lastError ? `\nError: ${server.lastError}` : '';

  const canToggle = connected;
  const section = Blocks.Section({
    text: [
      `*${truncate(server.name, appHome.maxMcpNameDisplay)}*`,
      `\`${truncate(server.url, appHome.maxMcpUrlDisplay)}\``,
      `${status}${lastError}`,
    ].join('\n'),
  });
  if (canToggle) {
    section.accessory(
      Elements.Button({
        actionId: server.enabled ? actions.disable : actions.enable,
        text: server.enabled ? 'Disable' : 'Enable',
        value: server.id,
      })
    );
  }

  return [
    section,
    Blocks.Actions().elements(
      Elements.Button({
        actionId: connected ? actions.disconnect : actions.connect,
        text: connected ? 'Disconnect' : 'Connect',
        value: server.id,
      }),
      Elements.Button({
        actionId: actions.delete,
        text: 'Delete',
        value: server.id,
      })
        .danger()
        .confirm(
          Bits.ConfirmationDialog({
            confirm: 'Delete',
            deny: 'Keep',
            text: 'This removes the server and stored credentials.',
            title: 'Delete MCP server?',
          })
        )
    ),
  ];
}

export function mcpBlocks(servers: McpServerWithOAuth[]) {
  const header = Blocks.Section({
    text: `*MCP Servers*${servers.length > 0 ? ` (${servers.length})` : ''}`,
  }).accessory(
    Elements.Button({
      actionId: actions.add,
      text: 'Add',
    })
  );

  if (servers.length === 0) {
    return [
      header,
      Blocks.Context().elements(
        'No MCP servers added yet. Add one to connect external tools.'
      ),
    ];
  }

  return [header, servers.flatMap((server) => serverBlocks(server))];
}
