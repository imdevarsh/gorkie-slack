import { createMCPServer } from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { publishHome } from '../../../publish';
import { blocks } from '../../ids';
import { textFieldValue } from '../../schema';
import type { SubmitArgs } from '../../types';
import { statusModal } from '../../view';
import { parseBaseFields } from './base';
import { connectBearerAndRender, updateView } from './connect-bearer-flow';

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

  await connectBearerAndRender({ bearerToken, body, client, server, viewId });
}
