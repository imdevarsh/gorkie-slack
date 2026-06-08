import { getMCPServerById } from '@repo/db/queries';
import { actions } from '../ids';
import { parseToolsMeta } from '../schema';
import type { InputArgs } from '../types';
import { toolsLoadingModal, toolsModal } from '../view';
import { syncToolsForView } from './helpers';

export const name = actions.searchTools;

export async function execute({
  ack,
  action,
  body,
  client,
}: InputArgs): Promise<void> {
  await ack();

  const view = body.view;
  if (!view?.id) {
    return;
  }

  const { serverId } = parseToolsMeta({ metadata: view.private_metadata });
  if (!serverId) {
    return;
  }

  const search = action.value?.trim() || undefined;

  const server = await getMCPServerById({ id: serverId, userId: body.user.id });
  if (!server) {
    return;
  }

  const loadingResult = await client.views
    .update({
      hash: view.hash,
      view_id: view.id,
      view: toolsLoadingModal({ search, serverId }),
    })
    .catch(() => undefined);
  const loadingHash = loadingResult?.view?.hash;

  const { error, toolEntries, toolModes } = await syncToolsForView({
    server,
    teamId: body.team?.id,
    userId: body.user.id,
  });

  await client.views
    .update({
      hash: loadingHash,
      view_id: view.id,
      view: toolsModal({
        error,
        search,
        serverId,
        serverName: server.name,
        toolModes,
        tools: toolEntries,
      }),
    })
    .catch(() => undefined);
}
