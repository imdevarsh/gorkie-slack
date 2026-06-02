import type { ListToolsResult } from '@ai-sdk/mcp';
import type { McpToolPermission } from '@repo/db/schema';
import type { ViewsOpenArguments } from '@slack/web-api';
import { Bits, Blocks, Elements, Modal } from 'slack-block-builder';
import type { SlackModalDto } from 'slack-block-builder/dist/internal';
import { codeBlock, mdText } from '@/slack/blocks';
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
    title: 'Connect MCP',
  })
    .notifyOnClose()
    .blocks(
      Blocks.Section({
        text: '*Connect MCP*\n\nAuthenticate with this MCP server, then return to Slack.',
      }),
      Blocks.Actions().elements(
        Elements.Button({
          text: 'Authenticate',
          url: authorizationUrl,
        })
      )
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
        text: `*Connect ${mdText(serverName)} to Gorkie*\nEnter a bearer token for this MCP server.`,
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

type ModalView = ViewsOpenArguments['view'];

export function statusModal({
  text,
  title,
}: {
  text: string;
  title: string;
}): ModalView {
  return {
    type: 'modal',
    title: { type: 'plain_text', text: title },
    close: { type: 'plain_text', text: 'Done' },
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text },
      },
    ],
  };
}

export function toolsModal({
  error,
  permissions,
  serverId,
  serverName,
  tools,
}: {
  error?: string;
  permissions: McpToolPermission[];
  serverId: string;
  serverName: string;
  tools: ListToolsResult['tools'];
}): ModalView {
  const canSave = !error && permissions.length > 0;
  const options = [
    { text: { type: 'plain_text', text: 'Allow always' }, value: 'allow' },
    { text: { type: 'plain_text', text: 'Ask' }, value: 'ask' },
    { text: { type: 'plain_text', text: 'Block' }, value: 'block' },
  ];
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
  const visiblePermissions = error ? [] : permissions;
  const groupedBlocks: ModalView['blocks'] = visiblePermissions
    .map((permission) => {
      const annotations = toolByName.get(permission.toolName)?.annotations;
      let group = 'Tools';
      if (annotations?.readOnlyHint === true) {
        group = 'Read-only tools';
      } else if (annotations?.destructiveHint === true) {
        group = 'Destructive tools';
      }
      return { group, permission };
    })
    .sort((a, b) =>
      `${a.group}:${a.permission.toolName}`.localeCompare(
        `${b.group}:${b.permission.toolName}`
      )
    )
    .flatMap(({ group, permission }, index, sorted) => {
      const previous = sorted[index - 1];
      const header =
        previous?.group === group
          ? []
          : [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*${group}*`,
                },
              },
            ];
      return [
        ...header,
        {
          type: 'section',
          block_id: `tool_${permission.id}`,
          text: {
            type: 'plain_text',
            text: permission.toolName.slice(0, 180),
          },
          accessory: {
            type: 'static_select',
            action_id: inputs.toolMode,
            placeholder: {
              type: 'plain_text',
              text: 'Mode',
            },
            options,
            initial_option:
              options.find(
                (option) =>
                  option.value ===
                  (permission.mode === 'auto' ? 'allow' : permission.mode)
              ) ?? options[1],
          },
        },
      ];
    });

  const modal: ModalView = {
    type: 'modal',
    callback_id: views.configure,
    private_metadata: JSON.stringify({ serverId }),
    title: { type: 'plain_text', text: 'MCP Tools' },
    ...(canSave ? { submit: { type: 'plain_text', text: 'Save' } } : {}),
    close: { type: 'plain_text', text: canSave ? 'Cancel' : 'Done' },
    blocks:
      groupedBlocks.length > 0
        ? [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${mdText(serverName)}*\nChoose which tools are allowed always, ask first, or stay blocked.${error ? `\n\nTool discovery warning: ${mdText(error)}` : ''}`,
              },
            },
            ...groupedBlocks,
          ]
        : [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: error
                  ? `*${mdText(serverName)}*\n\n*Error:*\n${codeBlock({ value: error, maxLength: 1200 })}`
                  : `*${mdText(serverName)}*\nNo tools were found for this server yet.`,
              },
            },
          ],
  };

  return modal;
}
