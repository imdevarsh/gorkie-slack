import { createMCPServer } from '@repo/db/queries';
import { errorMessage, toLogError } from '@repo/utils/error';
import logger from '@/lib/logger';
import { connectBearerServer } from '@/lib/mcp/connection';
import { mdText } from '@/slack/blocks';
import { publishHome } from '../../../publish';
import { blocks } from '../../ids';
import { textFieldValue } from '../../schema';
import type { SubmitArgs } from '../../types';
import { bearerModal, statusModal } from '../../view';
import { parseBaseFields } from './base';

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
        'Failed to update MCP bearer save modal'
      );
    });
}

export async function executeBearerSave({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  const base = await parseBaseFields({ view });
  const bearerToken = textFieldValue({
    field: 'bearer',
    values: view.state.values,
  });
  if (!bearerToken) {
    base.errors[blocks.bearer] = 'Enter a token.';
  }
  if (!base.data || Object.keys(base.errors).length > 0) {
    await ack({ errors: base.errors, response_action: 'errors' });
    return;
  }

  await ack({
    response_action: 'update',
    view: statusModal({ title: 'Connect MCP', text: 'Connecting…' }),
  });

  const userId = body.user.id;
  const viewId = view.id ?? '';
  let server: Awaited<ReturnType<typeof createMCPServer>>;
  try {
    server = await createMCPServer({
      authType: 'bearer',
      enabled: false,
      name: base.data.name,
      teamId: body.team?.id ?? null,
      transport: base.data.transport,
      url: base.data.url,
      userId,
    });
  } catch (error) {
    await updateView({
      client,
      userId,
      view: statusModal({
        title: 'Connect MCP',
        text: `Could not save this MCP server.\n\n${errorMessage(error)}`,
      }),
      viewId,
    });
    return;
  }
  if (!server) {
    await updateView({
      client,
      userId,
      view: statusModal({
        title: 'Connect MCP',
        text: 'Could not save this MCP server.',
      }),
      viewId,
    });
    await publishHome({ client, userId });
    return;
  }

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
