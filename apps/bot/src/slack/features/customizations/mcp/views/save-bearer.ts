import { updateMcpServerForUser } from '@repo/db/queries';
import { encryptSecret } from '@repo/utils';
import { env } from '@/env';
import { publishHome } from '../../publish';
import { blocks, inputs, views } from '../ids';
import type { ServerMeta, SubmitArgs } from '../types';

export const name = views.bearer;

export async function execute({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  const bearerToken =
    view.state.values[blocks.bearer]?.[inputs.bearer]?.value?.trim() ?? '';
  if (!bearerToken) {
    await ack({
      errors: { [blocks.bearer]: 'Enter a bearer token.' },
      response_action: 'errors',
    });
    return;
  }

  let serverId = '';
  try {
    const meta = JSON.parse(view.private_metadata || '{}') as ServerMeta;
    serverId = typeof meta.serverId === 'string' ? meta.serverId : '';
  } catch {
    serverId = '';
  }

  if (!serverId) {
    await ack({
      errors: { [blocks.bearer]: 'Could not identify this MCP server.' },
      response_action: 'errors',
    });
    return;
  }

  await ack();
  await updateMcpServerForUser({
    id: serverId,
    userId: body.user.id,
    values: {
      bearerToken: encryptSecret({
        plaintext: bearerToken,
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
      }),
      enabled: true,
      lastConnectedAt: null,
      lastError: null,
    },
  });
  await publishHome(client, body.user.id);
}
