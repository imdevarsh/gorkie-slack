import { getMCPServerById } from '@repo/db/queries';
import { blocks, views } from '../../ids';
import { parseServerMeta, textFieldValue } from '../../schema';
import type { SubmitArgs } from '../../types';
import { statusModal } from '../../view';
import { connectBearerAndRender } from '../save/connect-bearer-flow';

export const name = views.bearer;

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
      errors: { [blocks.bearer]: 'Enter a token.' },
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

  await connectBearerAndRender({
    bearerToken,
    body,
    client,
    server,
    viewId: view.id ?? '',
  });
}
