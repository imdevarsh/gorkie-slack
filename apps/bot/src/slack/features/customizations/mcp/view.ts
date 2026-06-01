import { Bits, Blocks, Elements, Modal } from 'slack-block-builder';
import type { SlackModalDto } from 'slack-block-builder/dist/internal';
import { blocks, inputs, views } from './ids';
import type { ModalState } from './types';

const httpOption = Bits.Option({ text: 'HTTP', value: 'http' });
const sseOption = Bits.Option({ text: 'SSE', value: 'sse' });
const oauthOption = Bits.Option({ text: 'OAuth', value: 'oauth' });
const bearerOption = Bits.Option({ text: 'Token', value: 'bearer' });

export function addModal(state: ModalState = {}): SlackModalDto {
  const auth = state.auth ?? 'oauth';
  const transport = state.transport ?? 'http';

  const modal = Modal({
    callbackId: views.add,
    close: 'Cancel',
    privateMetaData: JSON.stringify({ auth }),
    submit: 'Add',
    title: 'Add MCP Server',
  }).blocks(
    Blocks.Input({
      blockId: blocks.name,
      label: 'Name',
    }).element(
      Elements.TextInput({
        actionId: inputs.name,
        initialValue: state.name || undefined,
        maxLength: 80,
        placeholder: 'GitHub',
      })
    ),
    Blocks.Input({
      blockId: blocks.url,
      label: 'MCP URL',
    }).element(
      Elements.TextInput({
        actionId: inputs.url,
        initialValue: state.url || undefined,
        placeholder: 'https://example.com/mcp',
      })
    ),
    Blocks.Input({
      blockId: blocks.transport,
      label: 'Transport',
    }).element(
      Elements.StaticSelect({
        actionId: inputs.transport,
        placeholder: 'http',
      })
        .options(httpOption, sseOption)
        .initialOption(transport === 'sse' ? sseOption : httpOption)
    ),
    Blocks.Input({
      blockId: blocks.auth,
      label: 'Authentication',
    })
      .dispatchAction()
      .element(
        Elements.StaticSelect({
          actionId: inputs.auth,
          placeholder: 'OAuth',
        })
          .options(oauthOption, bearerOption)
          .initialOption(auth === 'bearer' ? bearerOption : oauthOption)
      )
  );

  if (auth === 'bearer') {
    modal.blocks(
      Blocks.Input({
        blockId: blocks.bearer,
        label: 'Token',
      }).element(
        Elements.TextInput({
          actionId: inputs.bearer,
          initialValue: state.bearerToken || undefined,
          placeholder: 'Token',
        })
      )
    );
  } else {
    modal.blocks(
      Blocks.Input({
        blockId: blocks.clientId,
        hint: 'Required for servers that do not support dynamic client registration. Leave blank for auto-registration.',
        label: 'Client ID',
      })
        .optional()
        .element(
          Elements.TextInput({
            actionId: inputs.clientId,
            initialValue: state.clientId || undefined,
            placeholder: 'Optional, only needed for pre-registered apps',
          })
        )
    );
  }

  return modal.buildToObject();
}

export function oauthModal({
  authorizationUrl,
  serverId,
}: {
  authorizationUrl: string;
  serverId: string;
}): SlackModalDto {
  return Modal({
    callbackId: views.oauth,
    close: 'Done',
    privateMetaData: JSON.stringify({ serverId }),
    title: 'Connect to Gorkie',
  })
    .notifyOnClose()
    .blocks(
      Blocks.Section({
        text: `*Connect MCP to Gorkie*\n\n<${authorizationUrl}|Authenticate>`,
      })
    )
    .buildToObject();
}

export function bearerModal({
  serverId,
  serverName,
}: {
  serverId: string;
  serverName: string;
}): SlackModalDto {
  return Modal({
    callbackId: views.bearer,
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
        blockId: blocks.bearer,
        label: 'Token',
      }).element(
        Elements.TextInput({
          actionId: inputs.bearer,
          placeholder: 'Token',
        })
      )
    )
    .buildToObject();
}
