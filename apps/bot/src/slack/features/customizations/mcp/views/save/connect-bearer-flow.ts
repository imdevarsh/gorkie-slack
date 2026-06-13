import type { MCPServer } from '@repo/db/schema';
import { errorMessage, toLogError } from '@repo/utils/error';
import logger from '@/lib/logger';
import { connectBearerServer } from '@/lib/mcp/connection';
import { mdText } from '@/slack/blocks';
import { publishHome } from '../../../publish';
import type { SubmitArgs } from '../../types';
import { bearerModal, statusModal } from '../../view';

export function updateView({
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
        'Failed to update MCP bearer modal'
      );
    });
}

// Shared tail of both bearer flows (create + reconnect): connect with the
// token, render the connected status or the error modal, then refresh App Home.
// The only thing the two flows differ on is how the `server` row is obtained.
export async function connectBearerAndRender({
  bearerToken,
  body,
  client,
  server,
  viewId,
}: {
  bearerToken: string;
  body: SubmitArgs['body'];
  client: SubmitArgs['client'];
  server: MCPServer;
  viewId: string;
}): Promise<void> {
  const userId = body.user.id;
  try {
    await connectBearerServer({
      rawToken: bearerToken,
      server,
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
