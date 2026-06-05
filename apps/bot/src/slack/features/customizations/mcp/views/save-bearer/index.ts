import { getMcpServerById } from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { connectBearerServer } from '@/lib/mcp/connection';
import { mdText } from '@/slack/blocks';
import { publishHome } from '../../../publish';
import { blocks, inputs, views } from '../../ids';
import { parseServerMeta, viewValueSchema } from '../../schema';
import type { SubmitArgs } from '../../types';
import { bearerModal, statusModal } from '../../view';

export const name = views.bearer;

export async function execute({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  const bearerToken =
    viewValueSchema
      .parse(view.state.values[blocks.bearer]?.[inputs.bearer])
      .value?.trim() ?? '';
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

  const server = await getMcpServerById({
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

  try {
    await connectBearerServer({
      rawToken: bearerToken,
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
