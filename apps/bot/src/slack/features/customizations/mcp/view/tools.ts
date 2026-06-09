import type { ListToolsResult } from '@ai-sdk/mcp';
import type { MCPToolModeMap } from '@repo/db/schema';
import type { GroupSlug, MCPToolsByGroup } from '@repo/validators';
import type { ViewsOpenArguments } from '@slack/web-api';
import Fuse from 'fuse.js';
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

function modeOption(mode: string) {
  if (mode === 'allow') {
    return allowOption;
  }
  if (mode === 'block') {
    return blockOption;
  }
  return askOption;
}

function injectCharacterDispatch(view: ModalView): ModalView {
  if (!view?.blocks) {
    return view;
  }
  const mutable = structuredClone(view) as typeof view;
  for (const block of mutable.blocks as unknown as Record<string, unknown>[]) {
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

function buildToolsByGroup(tools: ToolEntry[]): MCPToolsByGroup {
  const result: MCPToolsByGroup = { ro: [], dt: [], gn: [] };
  for (const tool of tools) {
    result[tool.group].push(tool.name);
  }
  return result;
}

function defaultOpenGroup(
  toolsByGroup: MCPToolsByGroup
): GroupSlug | undefined {
  for (const group of ['ro', 'dt', 'gn'] as GroupSlug[]) {
    if (toolsByGroup[group].length > 0) {
      return group;
    }
  }
  return;
}

export function toolsLoadingModal({
  search,
  serverId,
}: {
  search?: string;
  serverId: string;
}): ModalView {
  const nonce = renderNonce();
  return injectCharacterDispatch(
    Modal({
      callbackId: views.configure,
      close: 'Done',
      privateMetaData: JSON.stringify({ nonce, serverId, search }),
      title: 'MCP Tools',
    })
      .blocks(
        Blocks.Input({
          blockId: blocks.search,
          label: 'Search',
        })
          .optional()
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

const ACCORDION_THRESHOLD = 40;
const MAX_TOOLS_PER_GROUP = Math.floor((100 - 5) / 1);

export function toolsModal({
  error,
  open,
  search,
  serverId,
  serverName,
  toolModes,
  tools,
}: {
  error?: string;
  open?: GroupSlug;
  search?: string;
  serverId: string;
  serverName: string;
  toolModes: MCPToolModeMap;
  tools: ToolEntry[];
}): ModalView {
  const nonce = renderNonce();
  const searchTerm = search?.trim() || undefined;
  const allTools = error ? [] : tools;
  const toolsByGroup = buildToolsByGroup(allTools);
  const useAccordion = allTools.length > ACCORDION_THRESHOLD;
  const openGroup = useAccordion
    ? (open ?? defaultOpenGroup(toolsByGroup))
    : undefined;

  const modal = Modal({
    callbackId: views.configure,
    close: 'Done',
    privateMetaData: JSON.stringify({
      nonce,
      open: searchTerm ? undefined : openGroup,
      search: searchTerm,
      serverId,
      serverName,
      tools: toolsByGroup,
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
    .optional()
    .dispatchAction()
    .element(
      Elements.TextInput({
        actionId: actions.searchTools,
        initialValue: search || undefined,
        placeholder: 'Filter by name…',
      })
    );

  if (searchTerm) {
    const filtered = new Fuse(allTools, { keys: ['name'], threshold: 0.4 })
      .search(searchTerm)
      .map((r) => r.item);

    if (filtered.length === 0) {
      return injectCharacterDispatch(
        modal
          .blocks(
            searchBlock,
            Blocks.Section({
              text: `No tools match _${mdText(search ?? '')}_`,
            })
          )
          .buildToObject()
      );
    }

    const filteredByGroup: Record<GroupSlug, ToolEntry[]> = {
      dt: [],
      gn: [],
      ro: [],
    };
    for (const tool of filtered) {
      filteredByGroup[tool.group].push(tool);
    }

    const countInfo = ` · ${filtered.length} of ${allTools.length} match _${mdText(search ?? '')}_`;
    const resultBlocks = (['ro', 'dt', 'gn'] as GroupSlug[]).flatMap(
      (group) => {
        const groupTools = filteredByGroup[group];
        if (groupTools.length === 0) {
          return [];
        }
        return [
          Blocks.Context().elements(`*${groupNames[group]}*`),
          Blocks.Actions({ blockId: groupBlock.encode(nonce, group) }).elements(
            Elements.StaticSelect({
              actionId: actions.setGroupMode,
              placeholder: 'Set all…',
            }).options(...modeOptions)
          ),
          ...groupTools.map((tool) =>
            Blocks.Section({
              blockId: toolBlock.encode(nonce, tool.name),
              text: mdText(formatToolName(tool.name).slice(0, 180)),
            }).accessory(
              Elements.StaticSelect({
                actionId: inputs.toolMode,
                placeholder: 'Mode',
              })
                .options(...modeOptions)
                .initialOption(modeOption(toolModes[tool.name] ?? 'ask'))
            )
          ),
        ];
      }
    );

    return injectCharacterDispatch(
      modal
        .blocks(
          Blocks.Section({
            text: `*${mdText(serverName)}*${countInfo}`,
          }),
          searchBlock,
          ...resultBlocks
        )
        .buildToObject()
    );
  }

  const countInfo = allTools.length > 0 ? ` · ${allTools.length} tools` : '';

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

  const toolRow = (name: string) =>
    Blocks.Section({
      blockId: toolBlock.encode(nonce, name),
      text: mdText(formatToolName(name).slice(0, 180)),
    }).accessory(
      Elements.StaticSelect({ actionId: inputs.toolMode, placeholder: 'Mode' })
        .options(...modeOptions)
        .initialOption(modeOption(toolModes[name] ?? 'ask'))
    );

  const groupBlocks = useAccordion
    ? (['ro', 'dt', 'gn'] as GroupSlug[]).flatMap((group) => {
        const names = toolsByGroup[group];
        if (names.length === 0) {
          return [];
        }
        const isOpen = openGroup === group;
        return [
          Blocks.Actions({ blockId: groupBlock.encode(nonce, group) }).elements(
            Elements.Button({
              actionId: actions.toggleGroup,
              text: `${isOpen ? '▾' : '▸'} ${groupNames[group]}`,
              value: group,
            }),
            ...(isOpen
              ? [
                  Elements.StaticSelect({
                    actionId: actions.setGroupMode,
                    placeholder: 'Set all…',
                  }).options(...modeOptions),
                ]
              : [])
          ),
          ...(isOpen ? names.slice(0, MAX_TOOLS_PER_GROUP).map(toolRow) : []),
        ];
      })
    : (['ro', 'dt', 'gn'] as GroupSlug[]).flatMap((group) => {
        const names = toolsByGroup[group];
        if (names.length === 0) {
          return [];
        }
        return [
          Blocks.Context().elements(`*${groupNames[group]}*`),
          Blocks.Actions({ blockId: groupBlock.encode(nonce, group) }).elements(
            Elements.StaticSelect({
              actionId: actions.setGroupMode,
              placeholder: 'Set all…',
            }).options(...modeOptions)
          ),
          ...names.map(toolRow),
        ];
      });

  if (groupBlocks.length === 0) {
    return injectCharacterDispatch(
      modal
        .blocks(
          headerBlock,
          searchBlock,
          Blocks.Section({ text: 'No tools were found for this server yet.' })
        )
        .buildToObject()
    );
  }

  return injectCharacterDispatch(
    modal.blocks(headerBlock, searchBlock, ...groupBlocks).buildToObject()
  );
}
