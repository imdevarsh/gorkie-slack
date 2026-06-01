import { Bits, Blocks, Elements, Modal } from 'slack-block-builder';
import type { SlackModalDto } from 'slack-block-builder/dist/internal';

export interface McpAddModalState {
  authType?: 'bearer' | 'oauth';
  bearerToken?: string;
  clientId?: string;
  name?: string;
  transport?: 'http' | 'sse';
  url?: string;
}

const httpOption = Bits.Option({ text: 'HTTP', value: 'http' });
const sseOption = Bits.Option({ text: 'SSE', value: 'sse' });
const oauthOption = Bits.Option({ text: 'OAuth', value: 'oauth' });
const bearerOption = Bits.Option({ text: 'Bearer token', value: 'bearer' });

export function buildMcpAddModal(state: McpAddModalState = {}): SlackModalDto {
  const authType = state.authType ?? 'oauth';
  const transport = state.transport ?? 'http';

  const modal = Modal({
    callbackId: 'home_mcp_save',
    close: 'Cancel',
    privateMetaData: JSON.stringify({ authType }),
    submit: 'Add',
    title: 'Add MCP Server',
  }).blocks(
    Blocks.Input({
      blockId: 'name_block',
      label: 'Name',
    }).element(
      Elements.TextInput({
        actionId: 'name_input',
        initialValue: state.name || undefined,
        maxLength: 80,
        placeholder: 'GitHub MCP',
      })
    ),
    Blocks.Input({
      blockId: 'url_block',
      label: 'MCP URL',
    }).element(
      Elements.TextInput({
        actionId: 'url_input',
        initialValue: state.url || undefined,
        placeholder: 'https://example.com/mcp',
      })
    ),
    Blocks.Input({
      blockId: 'transport_block',
      label: 'Transport',
    }).element(
      Elements.StaticSelect({
        actionId: 'transport_input',
        placeholder: 'http',
      })
        .options(httpOption, sseOption)
        .initialOption(transport === 'sse' ? sseOption : httpOption)
    ),
    Blocks.Input({
      blockId: 'auth_block',
      label: 'Authentication',
    })
      .dispatchAction()
      .element(
        Elements.StaticSelect({
          actionId: 'auth_input',
          placeholder: 'OAuth',
        })
          .options(oauthOption, bearerOption)
          .initialOption(authType === 'bearer' ? bearerOption : oauthOption)
      )
  );

  if (authType === 'bearer') {
    modal.blocks(
      Blocks.Input({
        blockId: 'bearer_block',
        label: 'Bearer token',
      }).element(
        Elements.TextInput({
          actionId: 'bearer_input',
          initialValue: state.bearerToken || undefined,
          placeholder: 'Token',
        })
      )
    );
  } else {
    modal.blocks(
      Blocks.Input({
        blockId: 'client_id_block',
        hint: 'Required for servers like GitHub Copilot that do not support dynamic client registration. Leave blank for auto-registration.',
        label: 'Client ID',
      })
        .optional()
        .element(
          Elements.TextInput({
            actionId: 'client_id_input',
            initialValue: state.clientId || undefined,
            placeholder: 'Optional, only needed for pre-registered apps',
          })
        )
    );
  }

  return modal.buildToObject();
}

export function buildMcpConnectModal({
  authorizationUrl,
  serverId,
}: {
  authorizationUrl: string;
  serverId: string;
}): SlackModalDto {
  return Modal({
    callbackId: 'home_mcp_connect_status',
    close: 'Done',
    privateMetaData: JSON.stringify({ serverId }),
    title: 'Connect to Gorkie',
  })
    .notifyOnClose()
    .blocks(
      Blocks.Section({
        text: `*Connect MCP to Gorkie*\nOpen the OAuth page, approve access, then press *Done*.\n\n<${authorizationUrl}|Authenticate>`,
      })
    )
    .buildToObject();
}

export function buildMcpBearerTokenModal({
  serverId,
  serverName,
}: {
  serverId: string;
  serverName: string;
}): SlackModalDto {
  return Modal({
    callbackId: 'home_mcp_bearer_save',
    close: 'Cancel',
    privateMetaData: JSON.stringify({ serverId }),
    submit: 'Save',
    title: 'Connect MCP',
  })
    .blocks(
      Blocks.Section({
        text: `*Connect ${serverName} to Gorkie*\nEnter a bearer token for this MCP server.`,
      }),
      Blocks.Input({
        blockId: 'bearer_block',
        label: 'Bearer token',
      }).element(
        Elements.TextInput({
          actionId: 'bearer_input',
          placeholder: 'Token',
        })
      )
    )
    .buildToObject();
}
