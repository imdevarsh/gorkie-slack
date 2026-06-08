import type { ListToolsResult } from '@ai-sdk/mcp';
import type { MCPToolModeMap } from '@repo/db/schema';
import type { ViewsOpenArguments } from '@slack/web-api';
import Fuse from 'fuse.js';
import { Bits, Blocks, Elements, Modal } from 'slack-block-builder';
import { mcp } from '@/config';
import { formatMCPError } from '@/lib/mcp/format-error';
import { formatToolName } from '@/lib/mcp/format-tool-name';
import { codeBlock, mdText } from '@/slack/blocks';
import { groupBlock, renderNonce, toolBlock } from '../block-id';
import { actions, blocks, inputs, views } from '../ids';

type ModalView = ViewsOpenArguments['view'];
type GroupSlug = 'ro' | 'dt' | 'gn';
export interface ToolEntry {
  group: GroupSlug;
  name: string;
}
type ToolMeta = Record<string, { group: GroupSlug; name: string }>;

const GROUP_LABELS: Record<GroupSlug, string> = {
  dt: 'Destructive tools',
  gn: 'Tools',
  ro: 'Read-only tools',
};

const allowOption = Bits.Option({ text: 'Allow always', value: 'allow' });
const askOption = Bits.Option({ text: 'Ask', value: 'ask' });
const blockOption = Bits.Option({ text: 'Deny', value: 'block' });
const modeOptions = [allowOption, askOption, blockOption];

function injectCharacterDispatch(view: ModalView): ModalView {
  if (!view?.blocks) {
    return view;
  }
  const mutable = JSON.parse(JSON.stringify(view)) as typeof view;
  for (const block of mutable.blocks as Record<string, unknown>[]) {
    if (block.block_id === blocks.search) {
      const element = block.element as Record<string, unknown> | undefined;
      if (element) {
        element.dispatch_action_config = {
          trigger_actions_on: ['on_character_entered'],
        };
      }
    }
  }
  return mutable;
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

export function toolsLoadingModal({
  search,
  serverId,
  serverName,
}: {
  search?: string;
  serverId: string;
  serverName: string;
}): ModalView {
  const nonce = renderNonce();
  return injectCharacterDispatch(
    Modal({
      callbackId: views.configure,
      close: 'Done',
      privateMetaData: JSON.stringify({ nonce, page: 0, search, serverId }),
      title: 'MCP Tools',
    })
      .blocks(
        Blocks.Section({
          text: `*${mdText(serverName)}*\nChoose tool access: always allow, ask, or deny.`,
        }),
        Blocks.Input({
          blockId: blocks.search,
          label: 'Search',
        })
          .dispatchAction()
          .element(
            Elements.TextInput({
              actionId: actions.searchTools,
              initialValue: search || undefined,
              placeholder: 'Filter by name…',
            })
          ),
        Blocks.Context().elements('_Searching…_')
      )
      .buildToObject()
  );
}

export function toolsModal({
  error,
  page = 0,
  search,
  serverId,
  serverName,
  toolModes,
  tools,
}: {
  error?: string;
  page?: number;
  search?: string;
  serverId: string;
  serverName: string;
  toolModes: MCPToolModeMap;
  tools: ToolEntry[];
}): ModalView {
  const nonce = renderNonce();
  const searchTerm = search?.trim() || undefined;
  const allTools = error ? [] : tools;
  const filteredTools = searchTerm
    ? new Fuse(allTools, { keys: ['name'], threshold: 0.4 })
        .search(searchTerm)
        .map((r) => r.item)
    : allTools;

  const sortedTools = filteredTools
    .slice()
    .sort((a, b) =>
      `${a.group}:${a.name}`.localeCompare(`${b.group}:${b.name}`)
    );

  const pageSize = mcp.toolModalDefaultCount;
  const totalPages = Math.max(1, Math.ceil(sortedTools.length / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const pageSlice = sortedTools.slice(
    safePage * pageSize,
    (safePage + 1) * pageSize
  );

  const toolMeta: ToolMeta = {};
  const visibleItems: Array<{
    group: GroupSlug;
    id: string;
    mode: string;
    tool: ToolEntry;
  }> = [];
  for (const tool of pageSlice) {
    const id = visibleItems.length.toString(36);
    const meta = { group: tool.group, name: tool.name };
    const nextToolMeta = { ...toolMeta, [id]: meta };
    if (
      JSON.stringify({
        nonce,
        page: safePage,
        search: searchTerm,
        serverId,
        tools: nextToolMeta,
      }).length > mcp.toolModalMetadataMaxChars
    ) {
      break;
    }
    toolMeta[id] = meta;
    visibleItems.push({
      group: tool.group,
      id,
      mode: toolModes[tool.name] ?? 'ask',
      tool,
    });
  }

  const modal = Modal({
    callbackId: views.configure,
    close: 'Done',
    privateMetaData: JSON.stringify({
      nonce,
      page: safePage,
      search: searchTerm,
      serverId,
      tools: toolMeta,
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

  const searchBlock = Blocks.Input({
    blockId: blocks.search,
    label: 'Search',
  })
    .dispatchAction()
    .element(
      Elements.TextInput({
        actionId: actions.searchTools,
        initialValue: search || undefined,
        placeholder: 'Filter by name…',
      })
    );

  if (visibleItems.length === 0) {
    const noResultsText = searchTerm
      ? `No tools match _${mdText(search ?? '')}_`
      : 'No tools were found for this server yet.';
    return injectCharacterDispatch(
      modal
        .blocks(searchBlock, Blocks.Section({ text: noResultsText }))
        .buildToObject()
    );
  }

  const pageInfo =
    totalPages > 1 ? ` · Page ${safePage + 1} of ${totalPages}` : '';
  let countInfo = '';
  if (searchTerm) {
    countInfo = ` · ${filteredTools.length} of ${allTools.length} match _${mdText(search ?? '')}_`;
  } else if (allTools.length > pageSize) {
    countInfo = ` · ${allTools.length} tools`;
  }

  const groupedBlocks = visibleItems.flatMap(
    ({ group, id, mode, tool }, index, sorted) => {
      const previous = sorted[index - 1];
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
                blockId: groupBlock.encode(nonce, group),
                text: `*${GROUP_LABELS[group]}*`,
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
          text: mdText(formatToolName(tool.name).slice(0, 180)),
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

  const paginationElements = [
    ...(safePage > 0
      ? [
          Elements.Button({
            actionId: actions.goToPage,
            text: '← Prev',
            value: String(safePage - 1),
          }),
        ]
      : []),
    ...(safePage < totalPages - 1
      ? [
          Elements.Button({
            actionId: actions.goToPage,
            text: 'Next →',
            value: String(safePage + 1),
          }),
        ]
      : []),
  ];

  return injectCharacterDispatch(
    modal
      .blocks(
        Blocks.Section({
          text: `*${mdText(serverName)}*\nChoose tool access: always allow, ask, or deny.${countInfo}${pageInfo}`,
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
        searchBlock,
        ...groupedBlocks,
        ...(paginationElements.length > 0
          ? [Blocks.Actions().elements(...paginationElements)]
          : [])
      )
      .buildToObject()
  );
}
