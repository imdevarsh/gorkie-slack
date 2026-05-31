import { Bits, Blocks, Elements, Modal } from 'slack-block-builder';
import type { SlackModalDto } from 'slack-block-builder/dist/internal';

export function buildMcpAddModal(): SlackModalDto {
  return Modal({
    callbackId: 'home_mcp_save',
    close: 'Cancel',
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
          maxLength: 80,
          placeholder: 'GitHub MCP',
        })
      ),
      Blocks.Input({
        blockId: 'url_block',
        label: 'HTTPS MCP URL',
      }).element(
        Elements.TextInput({
          actionId: 'url_input',
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
          .options(
            Bits.Option({ text: 'HTTP', value: 'http' }),
            Bits.Option({ text: 'SSE', value: 'sse' })
          )
          .initialOption(Bits.Option({ text: 'HTTP', value: 'http' }))
      ),
      Blocks.Input({
        blockId: 'auth_block',
        label: 'Authentication',
      }).element(
        Elements.StaticSelect({
          actionId: 'auth_input',
          placeholder: 'OAuth',
        })
          .options(
            Bits.Option({ text: 'OAuth', value: 'oauth' }),
            Bits.Option({ text: 'Bearer token', value: 'bearer' })
          )
          .initialOption(Bits.Option({ text: 'OAuth', value: 'oauth' }))
      ),
      Blocks.Input({
        blockId: 'bearer_block',
        hint: 'Only used when Authentication is Bearer token.',
        label: 'Bearer token',
      })
        .optional()
        .element(
          Elements.TextInput({
            actionId: 'bearer_input',
            placeholder: 'Token',
          })
        )
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
    close: 'Done',
    title: 'Connect to Gorkie',
  })
    .blocks(
      Blocks.Section({
        text: '*Connect MCP to Gorkie*\nOpen the OAuth page, approve access, then use refresh status below.',
      }),
      Blocks.Actions().elements(
        Elements.Button({
          text: 'Open OAuth',
          url: authorizationUrl,
        }).primary(),
        Elements.Button({
          actionId: 'home_mcp_refresh',
          text: 'Refresh status',
          value: serverId,
        })
      )
    )
    .buildToObject();
}
