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
      )
    )
    .buildToObject();
}

export function buildMcpConnectModal({
  authorizationUrl,
}: {
  authorizationUrl: string;
}): SlackModalDto {
  return Modal({
    close: 'Done',
    title: 'Connect MCP',
  })
    .blocks(
      Blocks.Section({
        text: 'Open the OAuth page to connect this MCP server. Return to App Home after approving access.',
      }).accessory(
        Elements.Button({
          text: 'Open OAuth',
          url: authorizationUrl,
        })
      )
    )
    .buildToObject();
}
