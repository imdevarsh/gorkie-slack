import type { ListToolsResult } from '@ai-sdk/mcp';
import type { MCPToolModeMap } from '@repo/db/schema';
import type { GroupSlug } from '@repo/validators';
import type { ViewsOpenArguments } from '@slack/web-api';
import { Bits, Blocks, Elements, Modal } from 'slack-block-builder';
import { formatMCPError } from '@/lib/mcp/format-error';
import { formatToolName } from '@/lib/mcp/format-tool-name';
import { codeBlock, mdText } from '@/slack/blocks';
import { groupBlock, renderNonce, toolBlock } from '../block-id';
import { actions, blocks, groupNames, inputs, views } from '../ids';

type ModalView = ViewsOpenArguments['view'];
export interface ToolEntry {
  group: GroupSlug;
  name: string;
}

const allowOption = Bits.Option({ text: 'Allow always', value: 'allow' });
const askOption = Bits.Option({ text: 'Ask', value: 'ask' });
const blockOption = Bits.Option({ text: 'Deny', value: 'block' });
const modeOptions = [allowOption, askOption, blockOption];

const confirmReset = Bits.ConfirmationDialog({
  confirm: 'Reset',
  deny: 'Cancel',
  text: 'This will reset every tool on this MCP server to the default mode.',
  title: 'Reset tool modes?',
});

// Slack rejects views over 100 blocks; this budget leaves room for the header,
// search input, per-group headers/controls, and the truncation note. Search is
// the overflow mechanism when a server has more tools than fit.
const MAX_TOOL_ROWS = 85;

const GROUP_ORDER = ['ro', 'dt', 'gn'] as const satisfies GroupSlug[];

function modeOption(mode: string) {
  if (mode === 'allow') {
    return allowOption;
  }
  if (mode === 'block') {
    return blockOption;
  }
  return askOption;
}

export function toToolEntries(tools: ListToolsResult['tools']): ToolEntry[] {
  return tools.map((tool) => {
    const { annotations } = tool;
    let group: GroupSlug = 'gn';
    if (annotations?.readOnlyHint === true) {
      group = 'ro';
    } else if (annotations?.destructiveHint === true) {
      group = 'dt';
    }
    return { name: tool.name, group };
  });
}

function groupToolNames(tools: ToolEntry[]): Record<GroupSlug, string[]> {
  const result: Record<GroupSlug, string[]> = { ro: [], dt: [], gn: [] };
  for (const tool of tools) {
    result[tool.group].push(tool.name);
  }
  return result;
}

export function toolsModal({
  error,
  search,
  serverId,
  serverName,
  toolModes,
  tools,
}: {
  error?: string;
  search?: string;
  serverId: string;
  serverName: string;
  toolModes: MCPToolModeMap;
  tools: ToolEntry[];
}): ModalView {
  const nonce = renderNonce();
  const searchTerm = search?.trim() || undefined;

  const modal = Modal({
    callbackId: views.configure,
    close: 'Done',
    privateMetaData: JSON.stringify({
      nonce,
      search: searchTerm,
      serverId,
      serverName,
    }),
    title: 'MCP Tools',
  });

  if (error) {
    return modal
      .blocks(
        Blocks.Section({
          text: `*${mdText(serverName)}*\n\nThis server rejected the connection, so it has been disabled. Reconnect it from the App Home with a valid credential.\n\n*Error:*\n${codeBlock({ value: formatMCPError(error), maxLength: 1200 })}`,
        })
      )
      .buildToObject();
  }

  const searchBlock = Blocks.Input({ blockId: blocks.search, label: 'Search' })
    .optional()
    .dispatchAction()
    .element(
      Elements.TextInput({
        actionId: actions.searchTools,
        initialValue: searchTerm,
        placeholder: 'Filter by name…',
      })
    );

  const countInfo = tools.length > 0 ? ` · ${tools.length} tools` : '';
  const headerBlock = Blocks.Section({
    text: `*${mdText(serverName)}*\nChoose tool access: always allow, ask, or deny.${countInfo}`,
  }).accessory(
    Elements.Button({
      actionId: actions.resetTools,
      text: 'Reset',
      value: serverId,
    })
      .danger()
      .confirm(confirmReset)
  );

  if (tools.length === 0) {
    return modal
      .blocks(
        headerBlock,
        searchBlock,
        Blocks.Section({ text: 'No tools were found for this server yet.' })
      )
      .buildToObject();
  }

  const needle = searchTerm?.toLowerCase();
  const visible = needle
    ? tools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(needle) ||
          formatToolName(tool.name).toLowerCase().includes(needle)
      )
    : tools;

  if (visible.length === 0) {
    return modal
      .blocks(
        headerBlock,
        searchBlock,
        Blocks.Section({ text: `No tools match _${mdText(searchTerm ?? '')}_` })
      )
      .buildToObject();
  }

  const byGroup = groupToolNames(visible);

  // Allocate the global row budget across groups in ro→dt→gn order; 'gn'
  // truncates first. Tool rows count against the budget; group headers do not.
  let budget = MAX_TOOL_ROWS;
  const renderedGroups: { group: GroupSlug; names: string[] }[] = [];
  for (const group of GROUP_ORDER) {
    const names = byGroup[group];
    if (names.length === 0 || budget <= 0) {
      continue;
    }
    const slice = names.slice(0, budget);
    budget -= slice.length;
    renderedGroups.push({ group, names: slice });
  }
  const rendered = MAX_TOOL_ROWS - budget;

  const toolRow = (name: string) =>
    Blocks.Section({
      blockId: toolBlock.encode(nonce, name),
      text: mdText(formatToolName(name).slice(0, 180)),
    }).accessory(
      Elements.StaticSelect({ actionId: inputs.toolMode, placeholder: 'Mode' })
        .options(...modeOptions)
        .initialOption(modeOption(toolModes[name] ?? 'ask'))
    );

  const groupBlocks = renderedGroups.flatMap(({ group, names }) => [
    Blocks.Context().elements(`*${groupNames[group]}*`),
    Blocks.Actions({ blockId: groupBlock.encode(nonce, group) }).elements(
      Elements.StaticSelect({
        actionId: actions.setGroupMode,
        placeholder: 'Set all…',
      }).options(...modeOptions)
    ),
    ...names.map(toolRow),
  ]);

  const truncationNote =
    visible.length > rendered
      ? [
          Blocks.Context().elements(
            `Showing ${rendered} of ${visible.length} tools — search to narrow.`
          ),
        ]
      : [];

  return modal
    .blocks(headerBlock, searchBlock, ...groupBlocks, ...truncationNote)
    .buildToObject();
}
