import { createMCPServer, upsertMCPOAuthConnection } from '@repo/db/queries';
import { publishHome } from '../../../publish';
import { textFieldValue } from '../../schema';
import type { SubmitArgs } from '../../types';
import { parseBaseFields } from './base';

export async function executeOAuthSave({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  const base = await parseBaseFields({ view });
  if (!base.data) {
    await ack({ errors: base.errors, response_action: 'errors' });
    return;
  }

  await ack();

  const server = await createMCPServer({
    authType: 'oauth',
    enabled: false,
    name: base.data.name,
    transport: base.data.transport,
    url: base.data.url,
    userId: body.user.id,
  });
  if (!server) {
    await publishHome({ client, userId: body.user.id });
    return;
  }

  const clientId = textFieldValue({
    field: 'clientId',
    values: view.state.values,
  });
  if (clientId) {
    await upsertMCPOAuthConnection({
      clientId,
      serverId: server.id,
      userId: body.user.id,
    });
  }
  await publishHome({ client, userId: body.user.id });
}
