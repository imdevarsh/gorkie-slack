import type { ListToolsResult } from '@ai-sdk/mcp';
import type { MCPToolModeMap } from '@repo/db/schema';
import type { ViewsOpenArguments } from '@slack/web-api';
import { Bits, Blocks, Elements, Modal } from 'slack-block-builder';
import { mcp } from '@/config';
import { formatMCPError } from '@/lib/mcp/format-error';
import { codeBlock, mdText } from '@/slack/blocks';
import { groupBlock, renderNonce, toolBlock } from '../block-id';
import { actions, inputs, views } from '../ids';

type ModalView = ViewsOpenArguments['view'];
type GroupSlug = 'ro' | 'dt' | 'gn';
type ToolMeta = Record<string, { group: GroupSlug; name: string }>;

const allowOption = Bits.Option({ text: 'Allow always', value: 'allow' });
const askOption = Bits.Option({ text: 'Ask', value: 'ask' });
const blockOption = Bits.Option({ text: 'Deny', value: 'block' });
const modeOptions = [allowOption, askOption, blockOption];

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

  const groupedBlocks = visibleItems.flatMap(
    ({ group, id, mode, tool }, index, sorted) => {
      const previous = sorted[index - 1];
      const slug = groupSlugOf(group);
      let initialOption = askOption;
      if (mode === 'allow') {
        initialOption = allowOption;
      } else if (mode === 'block') {
        initialOption = blockOption;
      }
      const header =
        previous?.group === group
          ? []
          : [
              Blocks.Section({
                blockId: groupBlock.encode(nonce, slug),
                text: `*${group}*`,
              }).accessory(
                Elements.StaticSelect({
                  actionId: actions.setGroupMode,
                  placeholder: 'Set all…',
                }).options(...modeOptions)
              ),
            ];
      return [
        ...header,
        Blocks.Section({
          blockId: toolBlock.encode(nonce, id),
          text: mdText(tool.name.slice(0, 180)),
        }).accessory(
          Elements.StaticSelect({
            actionId: inputs.toolMode,
            placeholder: 'Mode',
          })
            .options(...modeOptions)
            .initialOption(initialOption)
        ),
      ];
    }
  );

  const modal = Modal({
    callbackId: views.configure,
    close: canSave ? 'Cancel' : 'Done',
    privateMetaData: JSON.stringify({ nonce, serverId, tools: toolMeta }),
    title: 'MCP Tools',
  });
  if (canSave) {
    modal.submit('Save');
  }

  if (groupedBlocks.length > 0) {
    return modal
      .blocks(
        Blocks.Section({
          text: `*${mdText(serverName)}*\nChoose tool access: always allow, ask, or deny.${hiddenToolCount > 0 ? `\n\nShowing ${visibleItems.length} of ${sortedItems.length} tools.` : ''}${error ? `\n\nTool discovery warning: ${mdText(error)}` : ''}`,
        }).accessory(
          Elements.Button({
            actionId: actions.resetTools,
            text: 'Reset',
            value: serverId,
          })
            .danger()
            .confirm(
              Bits.ConfirmationDialog({
                confirm: 'Reset',
                deny: 'Cancel',
                text: 'This will reset every tool on this MCP server to the default mode.',
                title: 'Reset tool modes?',
              })
            )
        ),
        ...groupedBlocks
      )
      .buildToObject();
  }

  return modal
    .blocks(
      Blocks.Section({
        text: error
          ? `*${mdText(serverName)}*\n\nThis server rejected the connection, so it has been disabled. Reconnect it from the App Home with a valid credential.\n\n*Error:*\n${codeBlock({ value: formatMCPError(error), maxLength: 1200 })}`
          : `*${mdText(serverName)}*\nNo tools were found for this server yet.`,
      })
    )
    .buildToObject();
}
