import type { McpServerWithConnection } from '@repo/db/queries';
import { Bits, Blocks, Elements } from 'slack-block-builder';
import { appHome } from '@/config';
import { formatMCPError } from '@/lib/mcp/format-error';
import { codeBlock, mdText } from '@/slack/blocks';
import { actions } from '../../mcp/ids';

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function serverBlocks(server: McpServerWithConnection) {
  const connected = server.hasConnection;
  const failed = Boolean(server.lastError);
  const healthy = connected && !failed;

  // Single lifecycle status so "Disabled" and "Disconnect" never collide.
  let statusLabel: string;
  if (!connected) {
    statusLabel = failed ? 'Connection failed' : 'Not connected';
  } else if (failed) {
    statusLabel = 'Connection failing';
  } else if (server.enabled) {
    statusLabel = 'Active';
  } else {
    statusLabel = 'Disabled';
  }

  const connectAction =
    server.authType === 'bearer' ? actions.connectBearer : actions.connectOAuth;

  // Name + the everyday toggle (Enable/Disable keeps the credential).
  const section = Blocks.Section({
    text: `*${mdText(truncate(server.name, appHome.maxMcpNameDisplay))}*`,
  });
  if (healthy) {
    section.accessory(
      Elements.Button({
        actionId: server.enabled ? actions.disable : actions.enable,
        text: server.enabled ? 'Disable' : 'Enable',
        value: server.id,
      })
    );
  }

  // Muted one-line context: status · url.
  const context = Blocks.Context().elements(
    `${statusLabel}  ·  \`${truncate(server.url, appHome.maxMcpUrlDisplay)}\``
  );

  const errorBlock = server.lastError
    ? [
        Blocks.Section({
          text: `*Error*\n${codeBlock({ value: formatMCPError(server.lastError), maxLength: 900 })}`,
        }),
      ]
    : [];

  const actionsBlock = Blocks.Actions().elements(
    // Healthy → Disconnect (remove credential). Otherwise → Connect.
    Elements.Button({
      actionId: healthy ? actions.disconnect : connectAction,
      text: healthy ? 'Disconnect' : 'Connect',
      value: server.id,
    }),
    ...(healthy
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
  );

  return [section, context, ...errorBlock, actionsBlock];
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
