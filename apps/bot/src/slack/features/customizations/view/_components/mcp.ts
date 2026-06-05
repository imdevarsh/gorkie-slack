import type { MCPServerWithConnection } from '@repo/db/queries';
import { Bits, Blocks, Elements } from 'slack-block-builder';
import { appHome } from '@/config';
import { formatMCPError } from '@/lib/mcp/format-error';
import { codeBlock, mdText, truncateText } from '@/slack/blocks';
import { actions } from '../../mcp/ids';

function serverBlocks(server: MCPServerWithConnection) {
  const connected = server.hasConnection;
  const failed = Boolean(server.lastError);
  const healthy = connected && !failed;

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

  const section = Blocks.Section({
    text: `*${mdText(truncateText(server.name, appHome.maxMCPNameDisplay))}*`,
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

  const context = Blocks.Context().elements(
    `${statusLabel}  ·  \`${truncateText(server.url, appHome.maxMCPUrlDisplay)}\``
  );

  const errorBlock = server.lastError
    ? [
        Blocks.Section({
          text: `*Error*\n${codeBlock({ value: formatMCPError(server.lastError), maxLength: 900 })}`,
        }),
      ]
    : [];

  const actionsBlock = Blocks.Actions().elements(
    Elements.Button({
      actionId: healthy ? actions.disconnect : connectAction,
      text: healthy ? 'Disconnect' : 'Connect',
      value: server.id,
    }),
    ...(healthy
      ? [
          Elements.Button({
            actionId: actions.configure,
            text: 'Update MCP Server',
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

export function mcpBlocks(servers: MCPServerWithConnection[]) {
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
