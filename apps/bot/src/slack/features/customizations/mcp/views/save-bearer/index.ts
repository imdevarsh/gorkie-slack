import { getMCPServerById } from '@repo/db/queries';
import { errorMessage, toLogError } from '@repo/utils/error';
import logger from '@/lib/logger';
import { connectBearerServer } from '@/lib/mcp/connection';
import { mdText } from '@/slack/blocks';
import { publishHome } from '../../../publish';
import { blocks, views } from '../../ids';
import { parseServerMeta, textFieldValue } from '../../schema';
import type { SubmitArgs } from '../../types';
import { bearerModal, statusModal } from '../../view';

export const name = views.bearer;

function updateView({
  client,
  userId,
  view,
  viewId,
}: {
  client: SubmitArgs['client'];
  userId: string;
  view: ReturnType<typeof statusModal>;
  viewId: string;
}) {
  return client.views
    .update({ view_id: viewId, view })
    .catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), userId, viewId },
        'Failed to update MCP bearer reconnect modal'
      );
    });
}

export async function execute({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  const bearerToken = textFieldValue({
    field: 'bearer',
    values: view.state.values,
  });
  if (!bearerToken) {
    await ack({
      errors: { [blocks.bearer]: 'Enter a bearer token.' },
      response_action: 'errors',
    });
    return;
  }

  const serverId =
    parseServerMeta({ metadata: view.private_metadata }).serverId ?? null;
  if (!serverId) {
    await ack({
      errors: { [blocks.bearer]: 'Could not identify this MCP server.' },
      response_action: 'errors',
    });
    return;
  }

  const server = await getMCPServerById({
    id: serverId,
    userId: body.user.id,
  });
  if (!server || server.authType !== 'bearer') {
    await ack({
      errors: { [blocks.bearer]: 'Could not find this MCP server.' },
      response_action: 'errors',
    });
    return;
  }

  await ack({
    response_action: 'update',
    view: statusModal({ title: 'Connect MCP', text: 'Connecting…' }),
  });

  const userId = body.user.id;
  const viewId = view.id ?? '';
  try {
    await connectBearerServer({
      rawToken: bearerToken,
      server,
      teamId: body.team?.id,
      userId,
    });
    await updateView({
      client,
      userId,
      view: statusModal({
        title: 'Connect MCP',
        text: `*${mdText(server.name)} is connected and enabled.*\nIts tools are ready to use. You can close this.`,
      }),
      viewId,
    });
  } catch (error) {
    await updateView({
      client,
      userId,
      view: bearerModal({
        error: errorMessage(error),
        serverId: server.id,
        serverName: server.name,
      }),
      viewId,
    });
  }

  await publishHome({ client, userId });
}
