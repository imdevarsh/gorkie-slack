import type { McpServerWithConnection } from '@repo/db/queries';
import { Bits, Blocks, Elements } from 'slack-block-builder';
import { appHome } from '@/config';
import { codeBlock, mdText } from '@/slack/blocks';
import { actions } from '../../mcp/ids';

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function serverBlocks(server: McpServerWithConnection) {
  const connected = server.hasConnection;
  const failed = Boolean(server.lastError);
  let authStatus = 'OAuth required';
  if (server.authType === 'bearer') {
    authStatus = connected ? 'Bearer token saved' : 'Bearer token required';
  } else if (connected) {
    authStatus = failed ? 'OAuth saved, MCP failed' : 'OAuth saved';
  }
  const status = `${server.enabled ? 'Enabled' : 'Disabled'} · ${authStatus}`;
  const lastError = server.lastError
    ? `\n\n*Error:*\n${codeBlock({ value: server.lastError, maxLength: 900 })}`
    : '';

  const canToggle = connected && !(failed && !server.enabled);
  const primaryAction =
    failed || !connected ? actions.connect : actions.disconnect;
  const primaryText = failed || !connected ? 'Connect' : 'Disconnect';
  const section = Blocks.Section({
    text: [
      `*${mdText(truncate(server.name, appHome.maxMcpNameDisplay))}*`,
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
        actionId: primaryAction,
        text: primaryText,
        value: server.id,
      }),
      ...(failed && connected
        ? [
            Elements.Button({
              actionId: actions.disconnect,
              text: 'Disconnect',
              value: server.id,
            }),
          ]
        : []),
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
    return [header, Blocks.Context().elements(appHome.mcpEmptyState)];
  }

  return [
    header,
    ...servers.flatMap((server, i) => [
      ...(i > 0 ? [Blocks.Divider()] : []),
      ...serverBlocks(server),
    ]),
  ];
}
