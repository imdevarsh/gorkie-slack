import { getMCPToolModes } from '@repo/db/queries';
import { mcpGroupSlugSchema } from '@repo/validators';
import { actions } from '../ids';
import { parseToolsMeta } from '../schema';
import type { ButtonArgs } from '../types';
import { toolsModal } from '../view';
import type { ToolEntry } from '../view/tools';

export const name = actions.toggleGroup;

export async function execute({
  ack,
  action,
  body,
  client,
}: ButtonArgs): Promise<void> {
  await ack();

  const view = body.view;
  if (!view?.id) {
    return;
  }

  const meta = parseToolsMeta({ metadata: view.private_metadata });
  const { open, search, serverId, serverName, tools: toolsByGroup } = meta;
  if (!(serverId && serverName && toolsByGroup)) {
    return;
  }

  const groupParsed = mcpGroupSlugSchema.safeParse(action.value);
  if (!groupParsed.success) {
    return;
  }
  const group = groupParsed.data;
  const nextOpen = open === group ? undefined : group;

  const allToolEntries: ToolEntry[] = [
    ...toolsByGroup.ro.map((n) => ({ name: n, group: 'ro' as const })),
    ...toolsByGroup.dt.map((n) => ({ name: n, group: 'dt' as const })),
    ...toolsByGroup.gn.map((n) => ({ name: n, group: 'gn' as const })),
  ];

  const { global: toolModes } = await getMCPToolModes({
    serverId,
    userId: body.user.id,
  });

  await client.views
    .update({
      hash: view.hash,
      view_id: view.id,
      view: toolsModal({
        open: nextOpen,
        search,
        serverId,
        serverName,
        toolModes,
        tools: allToolEntries,
      }),
    })
    .catch(() => undefined);
}
