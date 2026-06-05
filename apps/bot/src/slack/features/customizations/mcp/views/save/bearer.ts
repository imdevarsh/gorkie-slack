import { createMcpServer } from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { connectBearerServer } from '@/lib/mcp/connection';
import { mdText } from '@/slack/blocks';
import { publishHome } from '../../../publish';
import { blocks, inputs } from '../../ids';
import { viewValueSchema } from '../../schema';
import type { SubmitArgs } from '../../types';
import { bearerModal, statusModal } from '../../view';
import { parseBaseFields } from './base';

export async function executeBearerSave({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  const base = await parseBaseFields({ view });
  const bearerToken =
    viewValueSchema
      .parse(view.state.values[blocks.bearer]?.[inputs.bearer])
      .value?.trim() ?? '';
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

  const server = await createMcpServer({
    authType: 'bearer',
    enabled: false,
    name: base.data.name,
    teamId: body.team?.id ?? null,
    transport: base.data.transport,
    url: base.data.url,
    userId: body.user.id,
  });
  if (!server) {
    await publishHome({ client, userId: body.user.id });
    return;
  }

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
