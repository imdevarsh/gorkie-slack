import type { McpServerWithConnection } from '@repo/db/queries';
import { Bits, Blocks, Elements } from 'slack-block-builder';
import { appHome } from '@/config';
import { codeBlock } from '@/slack/blocks';
import { actions } from '../../mcp/ids';

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function serverBlocks(server: McpServerWithConnection) {
  const connected = server.hasConnection;
  let authStatus = 'OAuth required';
  if (server.authType === 'bearer') {
    authStatus = connected ? 'Bearer token set' : 'Bearer token required';
  } else if (connected) {
    authStatus = 'OAuth connected';
  }
  const status = `${server.enabled ? 'Enabled' : 'Disabled'} · ${authStatus}`;
  const lastError = server.lastError
    ? `\n\n*Error:*\n${codeBlock({ value: server.lastError, maxLength: 900 })}`
    : '';

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
      ...(connected && server.enabled
        ? [
            Elements.Button({
              actionId: actions.configure,
              text: 'Configure',
              value: server.id,
            }),
          ]
        : []),
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

export function mcpBlocks(servers: McpServerWithConnection[]) {
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

  return [
    header,
    ...servers.flatMap((server, i) => [
      ...(i > 0 ? [Blocks.Divider()] : []),
      ...serverBlocks(server),
    ]),
  ];
}
