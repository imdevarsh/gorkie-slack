import {
  createMcpServer,
  updateMcpServerForUser,
  upsertMcpBearerConnection,
  upsertMcpOAuthConnection,
} from '@repo/db/queries';
import { encryptSecret, validateHttpsUrlForServer } from '@repo/utils';
import { errorMessage } from '@repo/utils/error';
import { env } from '@/env';
import { syncMcpPermissions } from '@/lib/mcp/remote';
import { publishHome } from '../../publish';
import { blocks, inputs, views } from '../ids';
import type { Auth, SubmitArgs, Transport } from '../types';

export const name = views.add;

export async function execute({
  ack,
  body,
  client,
  view,
}: SubmitArgs): Promise<void> {
  const state = view.state.values;
  const nameValue = state[blocks.name]?.[inputs.name]?.value?.trim() ?? '';
  const urlValue = state[blocks.url]?.[inputs.url]?.value?.trim() ?? '';
  const authValue =
    state[blocks.auth]?.[inputs.auth]?.selected_option?.value ?? 'oauth';
  const transportValue =
    state[blocks.transport]?.[inputs.transport]?.selected_option?.value ??
    'http';
  const auth: Auth =
    authValue === 'bearer' || authValue === 'oauth' ? authValue : 'oauth';
  const transport: Transport =
    transportValue === 'http' || transportValue === 'sse'
      ? transportValue
      : 'http';
  const bearerToken =
    state[blocks.bearer]?.[inputs.bearer]?.value?.trim() ?? '';
  const clientId =
    state[blocks.clientId]?.[inputs.clientId]?.value?.trim() ?? '';

  const errors: Record<string, string> = {};
  if (!nameValue) {
    errors[blocks.name] = 'Enter a name.';
  }
  if (!(authValue === 'oauth' || authValue === 'bearer')) {
    errors[blocks.auth] = 'Choose OAuth or token.';
  }
  if (!(transportValue === 'http' || transportValue === 'sse')) {
    errors[blocks.transport] = 'Transport must be http or sse.';
  }
  if (auth === 'bearer' && !bearerToken) {
    errors[blocks.bearer] = 'Enter a token.';
  }

  let safeUrl = '';
  try {
    safeUrl = await validateHttpsUrlForServer(urlValue);
  } catch (error) {
    errors[blocks.url] =
      error instanceof Error ? error.message : 'Enter a valid HTTPS URL.';
  }

  if (Object.keys(errors).length > 0) {
    await ack({ errors, response_action: 'errors' });
    return;
  }

  const token =
    auth === 'bearer'
      ? encryptSecret({
          plaintext: bearerToken,
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        })
      : null;
  await ack();
  const server = await createMcpServer({
    authType: auth,
    enabled: auth === 'bearer',
    name: nameValue,
    teamId: body.team?.id ?? null,
    transport,
    url: safeUrl,
    userId: body.user.id,
  });
  if (server && token) {
    await upsertMcpBearerConnection({
      token,
      serverId: server.id,
      teamId: body.team?.id ?? null,
      userId: body.user.id,
    });
  }
  if (server && auth === 'oauth' && clientId) {
    await upsertMcpOAuthConnection({
      clientId,
      serverId: server.id,
      teamId: body.team?.id ?? null,
      userId: body.user.id,
    });
  }
  if (server && auth === 'bearer') {
    try {
      await syncMcpPermissions({
        server,
        teamId: body.team?.id,
        userId: body.user.id,
      });
    } catch (error) {
      await updateMcpServerForUser({
        id: server.id,
        userId: body.user.id,
        values: {
          enabled: false,
          lastError: errorMessage(error),
        },
      });
    }
  }
  await publishHome(client, body.user.id);
}
