import { Bits, Blocks, Elements, Modal } from 'slack-block-builder';
import type { SlackModalDto } from 'slack-block-builder/dist/internal';

export interface McpAddModalState {
  authType?: 'bearer' | 'oauth';
  bearerToken?: string;
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
  const bearerBlocks =
    authType === 'bearer'
      ? [
          Blocks.Input({
            blockId: 'bearer_block',
            label: 'Bearer token',
          }).element(
            Elements.TextInput({
              actionId: 'bearer_input',
              initialValue: state.bearerToken || undefined,
              placeholder: 'Token',
            })
          ),
        ]
      : [];

  return Modal({
    callbackId: 'home_mcp_save',
    close: 'Cancel',
    privateMetaData: JSON.stringify({ authType }),
    submit: 'Add',
    title: 'Add MCP Server',
  })
    .blocks(
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
      }).element(
        Elements.StaticSelect({
          actionId: 'auth_input',
          placeholder: 'OAuth',
        })
          .options(oauthOption, bearerOption)
          .initialOption(authType === 'bearer' ? bearerOption : oauthOption)
      ),
      bearerBlocks
    )
    .buildToObject();
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
        text: '*Connect MCP to Gorkie*\nOpen the OAuth page, approve access, then press Done.',
      }),
      Blocks.Actions().elements(
        Elements.Button({
          text: 'Open OAuth',
          url: authorizationUrl,
        }).primary()
      )
    )
    .buildToObject();
}
