import { createMcpServer } from '@repo/db/queries';
import { encryptSecret } from '@repo/utils';
import { env } from '@/env';
import { validateHttpsUrlForServer } from '@/lib/mcp/guarded-fetch';
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
    errors[blocks.auth] = 'Choose OAuth or bearer token.';
  }
  if (!(transportValue === 'http' || transportValue === 'sse')) {
    errors[blocks.transport] = 'Transport must be http or sse.';
  }
  if (auth === 'bearer' && !bearerToken) {
    errors[blocks.bearer] = 'Enter a bearer token.';
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

  await ack();
  await createMcpServer({
    authType: auth,
    bearerToken:
      auth === 'bearer'
        ? encryptSecret({
            plaintext: bearerToken,
            secret: env.MCP_TOKEN_ENCRYPTION_KEY,
          })
        : null,
    clientId: auth === 'oauth' && clientId ? clientId : null,
    enabled: auth === 'bearer',
    name: nameValue,
    teamId: body.team?.id ?? null,
    transport,
    url: safeUrl,
    userId: body.user.id,
  });
  await publishHome(client, body.user.id);
}
