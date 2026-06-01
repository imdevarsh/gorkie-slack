import type { McpToolPermission } from '@repo/db/schema';
import { clampText } from '@repo/utils/text';
import { Bits, Blocks, Elements, Modal } from 'slack-block-builder';
import type { SlackModalDto } from 'slack-block-builder/dist/internal';
import { blocks, inputs, views } from './ids';
import type { ModalState } from './types';

const httpOption = Bits.Option({ text: 'HTTP', value: 'http' });
const sseOption = Bits.Option({ text: 'SSE', value: 'sse' });
const oauthOption = Bits.Option({ text: 'OAuth', value: 'oauth' });
const bearerOption = Bits.Option({ text: 'Token', value: 'bearer' });
const READ_TOOL_PATTERN = /^(get|list|search|find|read)_?/i;
const WRITE_TOOL_PATTERN =
  /^(create|add|update|edit|set|delete|remove|send|post)_?/i;

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

function modeOption({ text, value }: { text: string; value: string }) {
  return {
    text: { type: 'plain_text', text },
    value,
  };
}

function toolGroup(toolName: string): 'Other' | 'Read' | 'Write' {
  if (READ_TOOL_PATTERN.test(toolName)) {
    return 'Read';
  }
  if (WRITE_TOOL_PATTERN.test(toolName)) {
    return 'Write';
  }
  return 'Other';
}

function codeBlock(value: string): string {
  return `\`\`\`${clampText(value.replaceAll('```', "'''"), 1200)}\`\`\``;
}

export function toolsModal({
  error,
  permissions,
  serverId,
  serverName,
}: {
  error?: string;
  permissions: McpToolPermission[];
  serverId: string;
  serverName: string;
}): SlackModalDto {
  const canSave = !error && permissions.length > 0;
  const options = [
    modeOption({ text: 'Allow always', value: 'allow' }),
    modeOption({ text: 'Ask', value: 'ask' }),
    modeOption({ text: 'Block', value: 'block' }),
  ];
  const visiblePermissions = error ? [] : permissions.slice(0, 20);
  const groupedBlocks = visiblePermissions
    .sort((a, b) =>
      `${toolGroup(a.toolName)}:${a.toolName}`.localeCompare(
        `${toolGroup(b.toolName)}:${b.toolName}`
      )
    )
    .flatMap((permission, index, sorted) => {
      const group = toolGroup(permission.toolName);
      const previous = sorted[index - 1];
      const header =
        previous && toolGroup(previous.toolName) === group
          ? []
          : [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*${group} tools*`,
                },
              },
            ];
      return [
        ...header,
        {
          type: 'section',
          block_id: `tool_${permission.id}`,
          text: {
            type: 'mrkdwn',
            text: `\`${permission.toolName.slice(0, 180)}\``,
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

  const modal = {
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
                text: `*${serverName}*\nChoose which tools are allowed always, ask first, or stay blocked.${error ? `\n\nTool discovery warning: ${error}` : ''}`,
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
                  ? `*${serverName}*\n\n*Error:*\n${codeBlock(error)}`
                  : `*${serverName}*\nNo tools were found for this server yet. Run a request that uses this MCP server, then reopen this modal.`,
              },
            },
          ],
  };

  return modal as SlackModalDto;
}
