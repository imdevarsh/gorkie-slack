import { createMcpServer, upsertMcpOAuthConnection } from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { connectBearerServer } from '@/lib/mcp/connection';
import { mdText } from '@/slack/blocks';
import { publishHome } from '../../../publish';
import { views } from '../../ids';
import type { SubmitArgs } from '../../types';
import { bearerModal, statusModal } from '../../view';
import { parseSavePayload } from './schema';

export const name = views.add;

export async function execute({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  const payload = await parseSavePayload({ view });
  if (!payload.data) {
    await ack({ errors: payload.errors, response_action: 'errors' });
    return;
  }

  // Bearer: hold the modal open to report the validation result inline.
  // OAuth: close immediately — connection happens via the Connect button.
  if (payload.data.auth === 'bearer') {
    await ack({
      response_action: 'update',
      view: statusModal({ title: 'Connect MCP', text: 'Connecting…' }),
    });
  } else {
    await ack();
  }

  const server = await createMcpServer({
    authType: payload.data.auth,
    enabled: false,
    name: payload.data.name,
    teamId: body.team?.id ?? null,
    transport: payload.data.transport,
    url: payload.data.url,
    userId: body.user.id,
  });
  if (!server) {
    await publishHome({ client, userId: body.user.id });
    return;
  }

  if (payload.data.auth === 'oauth') {
    if (payload.data.clientId) {
      await upsertMcpOAuthConnection({
        clientId: payload.data.clientId,
        serverId: server.id,
        teamId: body.team?.id ?? null,
        userId: body.user.id,
      });
    }
    await publishHome({ client, userId: body.user.id });
    return;
  }

  // Bearer: validate-then-persist (SOP). The token is only stored if it works.
  try {
    await connectBearerServer({
      rawToken: payload.data.bearerToken,
      server,
      teamId: body.team?.id,
      userId: body.user.id,
    });
    await client.views
      .update({
        view_id: view.id ?? '',
        view: statusModal({
          title: 'Connect MCP',
          text: `*${mdText(server.name)} is connected and enabled.*\nIts tools are ready to use. You can close this.`,
        }),
      })
      .catch(() => undefined);
  } catch (error) {
    // Re-show the token field with the error so the user can retry in place.
    await client.views
      .update({
        view_id: view.id ?? '',
        view: bearerModal({
          error: errorMessage(error),
          serverId: server.id,
          serverName: server.name,
        }),
      })
      .catch(() => undefined);
  }
  await publishHome({ client, userId: body.user.id });
}
