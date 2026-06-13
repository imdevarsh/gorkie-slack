import { getMCPServerById } from '@repo/db/queries';
import { errorMessage, toLogError } from '@repo/utils/error';
import logger from '@/lib/logger';
import { connectOAuthServer } from '@/lib/mcp/connection';
import { formatMCPError } from '@/lib/mcp/format-error';
import { codeBlock } from '@/slack/blocks';
import { publishHome } from '../../publish';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';
import { oauthModal, statusModal } from '../view';

export const name = actions.connectOAuth;

function updateView({
  client,
  userId,
  view,
  viewId,
}: {
  client: ButtonArgs['client'];
  userId: string;
  view: ReturnType<typeof statusModal>;
  viewId: string;
}) {
  return client.views
    .update({ view_id: viewId, view })
    .catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), userId, viewId },
        'Failed to update MCP OAuth modal'
      );
    });
}

export async function execute({
  ack,
  action,
  body,
  client,
}: ButtonArgs): Promise<void> {
  await ack();
  const userId = body.user.id;
  if (!action.value) {
    return;
  }

  const opened = await client.views
    .open({
      trigger_id: body.trigger_id,
      view: statusModal({
        title: 'Connect MCP',
        text: 'Preparing connection…',
      }),
    })
    .catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), userId },
        'Failed to open MCP OAuth modal'
      );
      return null;
    });
  if (!opened) {
    return;
  }

  const viewId = opened.view?.id;
  if (!viewId) {
    logger.warn({ userId }, 'MCP OAuth modal opened without view ID');
    return;
  }

  const server = await getMCPServerById({
    id: action.value,
    userId,
  });
  if (!server || server.authType !== 'oauth') {
    await updateView({
      client,
      userId,
      view: statusModal({
        title: 'Connect MCP',
        text: 'Could not find this MCP server.',
      }),
      viewId,
    });
    return;
  }

  try {
    const result = await connectOAuthServer({
      server,
      userId,
    });

    if (result.status === 'authorize') {
      await client.views
        .update({
          view_id: viewId,
          view: oauthModal({
            authorizationURL: result.authorizationURL,
            serverId: server.id,
            serverName: server.name,
          }),
        })
        .catch((error: unknown) => {
          logger.warn(
            { ...toLogError(error), serverId: server.id, userId, viewId },
            'Failed to update MCP OAuth authorization modal'
          );
        });
      return;
    }

    await publishHome({ client, userId });
    await updateView({
      client,
      userId,
      view: statusModal({
        title: 'Connect MCP',
        text: 'This MCP server is connected. You can close this modal.',
      }),
      viewId,
    });
  } catch (error) {
    await publishHome({ client, userId });
    await updateView({
      client,
      userId,
      view: statusModal({
        title: 'Connection Failed',
        text: `Could not connect:\n${codeBlock({ value: formatMCPError(errorMessage(error)), maxLength: 900 })}`,
      }),
      viewId,
    });
  }
}
