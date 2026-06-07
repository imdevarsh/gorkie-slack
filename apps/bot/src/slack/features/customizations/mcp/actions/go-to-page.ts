import { getMCPServerById } from '@repo/db/queries';
import type { MCPToolModeMap } from '@repo/db/schema';
import { errorMessage } from '@repo/utils/error';
import { syncMCPToolModes } from '@/lib/mcp/remote';
import { actions } from '../ids';
import { parseToolsMeta } from '../schema';
import type { ButtonArgs } from '../types';
import { toolsModal } from '../view';
import { toToolEntries } from '../view/tools';

export const name = actions.goToPage;

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
  const { search, serverId } = meta;
  if (!serverId) {
    return;
  }

  const page = Number(action.value);
  if (!Number.isFinite(page)) {
    return;
  }

  const server = await getMCPServerById({ id: serverId, userId: body.user.id });
  if (!server) {
    return;
  }

  let error: string | undefined;
  let toolEntries: ReturnType<typeof toToolEntries> = [];
  let toolModes: MCPToolModeMap = {};
  try {
    const synced = await syncMCPToolModes({
      server,
      teamId: body.team?.id,
      userId: body.user.id,
    });
    toolEntries = toToolEntries(synced.definitions.tools);
    toolModes = synced.modes;
  } catch (err) {
    error = errorMessage(err);
  }

  await client.views
    .update({
      hash: view.hash,
      view_id: view.id,
      view: toolsModal({
        error,
        page,
        search,
        serverId,
        serverName: server.name,
        toolModes,
        tools: toolEntries,
      }),
    })
    .catch(() => undefined);
}
