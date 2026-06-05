import type { ListToolsResult } from '@ai-sdk/mcp';
import type { MCPToolModeMap } from '@repo/db/schema';
import type { ViewsOpenArguments } from '@slack/web-api';
import { mcp } from '@/config';
import { formatMCPError } from '@/lib/mcp/format-error';
import { codeBlock, mdText } from '@/slack/blocks';
import { groupBlock, renderNonce, toolBlock } from '../block-id';
import { actions, inputs, views } from '../ids';

type ModalView = ViewsOpenArguments['view'];
type GroupSlug = 'ro' | 'dt' | 'gn';
type ToolMeta = Record<string, { group: GroupSlug; name: string }>;

function groupSlugOf(group: string): GroupSlug {
  if (group === 'Read-only tools') {
    return 'ro';
  }
  if (group === 'Destructive tools') {
    return 'dt';
  }
  return 'gn';
}

export function toolsModal({
  error,
  serverId,
  serverName,
  toolModes,
  tools,
}: {
  error?: string;
  serverId: string;
  serverName: string;
  toolModes: MCPToolModeMap;
  tools: ListToolsResult['tools'];
}): ModalView {
  const nonce = renderNonce();
  const options = [
    { text: { type: 'plain_text', text: 'Allow always' }, value: 'allow' },
    { text: { type: 'plain_text', text: 'Ask' }, value: 'ask' },
    { text: { type: 'plain_text', text: 'Block' }, value: 'block' },
  ];
  const visibleTools = error ? [] : tools;

  const sortedItems = visibleTools
    .map((tool) => {
      const annotations = tool.annotations;
      let group = 'Tools';
      if (annotations?.readOnlyHint === true) {
        group = 'Read-only tools';
      } else if (annotations?.destructiveHint === true) {
        group = 'Destructive tools';
      }
      return {
        group,
        mode: toolModes[tool.name] ?? 'ask',
        tool,
      };
    })
    .sort((a, b) =>
      `${a.group}:${a.tool.name}`.localeCompare(`${b.group}:${b.tool.name}`)
    );

  const toolMeta: ToolMeta = {};
  const visibleItems: Array<(typeof sortedItems)[number] & { id: string }> = [];
  for (const item of sortedItems) {
    if (visibleItems.length >= mcp.toolModalMaxTools) {
      break;
    }
    const id = visibleItems.length.toString(36);
    const meta = { group: groupSlugOf(item.group), name: item.tool.name };
    const nextToolMeta = {
      ...toolMeta,
      [id]: meta,
    };
    if (
      JSON.stringify({ nonce, serverId, tools: nextToolMeta }).length >
      mcp.toolModalMetadataMaxChars
    ) {
      break;
    }
    toolMeta[id] = meta;
    visibleItems.push({ ...item, id });
  }
  const hiddenToolCount = sortedItems.length - visibleItems.length;
  const canSave = !error && visibleItems.length > 0;

  const groupedBlocks: ModalView['blocks'] = visibleItems.flatMap(
    ({ group, id, mode, tool }, index, sorted) => {
      const previous = sorted[index - 1];
      const slug = groupSlugOf(group);
      const header =
        previous?.group === group
          ? []
          : [
              {
                type: 'section',
                block_id: groupBlock.encode(nonce, slug),
                text: { type: 'mrkdwn', text: `*${group}*` },
                accessory: {
                  type: 'static_select',
                  action_id: actions.setGroupMode,
                  placeholder: { type: 'plain_text', text: 'Set all…' },
                  options,
                },
              },
            ];
      return [
        ...header,
        {
          type: 'section',
          block_id: toolBlock.encode(nonce, id),
          text: {
            type: 'plain_text',
            text: tool.name.slice(0, 180),
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
              options.find((option) => option.value === mode) ?? options[1],
          },
        },
      ];
    }
  );

  return {
    type: 'modal',
    callback_id: views.configure,
    private_metadata: JSON.stringify({ nonce, serverId, tools: toolMeta }),
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
                text: `*${mdText(serverName)}*\nChoose tool access: always allow, ask, or blocked.${hiddenToolCount > 0 ? `\n\nShowing ${visibleItems.length} of ${sortedItems.length} tools.` : ''}${error ? `\n\nTool discovery warning: ${mdText(error)}` : ''}`,
              },
              accessory: {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Reset',
                },
                style: 'danger',
                action_id: actions.resetTools,
                value: serverId,
                confirm: {
                  title: {
                    type: 'plain_text',
                    text: 'Reset tool modes?',
                  },
                  text: {
                    type: 'plain_text',
                    text: 'This will reset every tool on this MCP server to the default mode.',
                  },
                  confirm: {
                    type: 'plain_text',
                    text: 'Reset',
                  },
                  deny: {
                    type: 'plain_text',
                    text: 'Cancel',
                  },
                },
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
                  ? `*${mdText(serverName)}*\n\nThis server rejected the connection, so it has been disabled. Reconnect it from the App Home with a valid credential.\n\n*Error:*\n${codeBlock({ value: formatMCPError(error), maxLength: 1200 })}`
                  : `*${mdText(serverName)}*\nNo tools were found for this server yet.`,
              },
            },
          ],
  };
}
