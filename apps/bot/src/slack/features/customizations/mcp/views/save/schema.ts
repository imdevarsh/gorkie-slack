import { mcpServerUrlSchema } from '@repo/validators';
import { blocks, inputs } from '../../ids';
import { viewSelectedSchema, viewValueSchema } from '../../schema';
import type { Auth, SubmitArgs, Transport } from '../../types';

export async function parseSavePayload({
  view,
}: {
  view: SubmitArgs['view'];
}): Promise<
  | {
      data: {
        auth: Auth;
        bearerToken: string;
        clientId: string;
        name: string;
        transport: Transport;
        url: string;
      };
      errors: Record<string, never>;
    }
  | { data: null; errors: Record<string, string> }
> {
  const state = view.state.values;
  const name = viewValueSchema
    .parse(state[blocks.name]?.[inputs.name])
    .value?.trim();
  const urlValue = viewValueSchema
    .parse(state[blocks.url]?.[inputs.url])
    .value?.trim();
  const authValue =
    viewSelectedSchema.parse(state[blocks.auth]?.[inputs.auth]).selected_option
      ?.value ?? 'oauth';
  const transportValue =
    viewSelectedSchema.parse(state[blocks.transport]?.[inputs.transport])
      .selected_option?.value ?? 'http';
  const auth: Auth =
    authValue === 'bearer' || authValue === 'oauth' ? authValue : 'oauth';
  const transport: Transport =
    transportValue === 'http' || transportValue === 'sse'
      ? transportValue
      : 'http';
  const bearerToken =
    viewValueSchema
      .parse(state[blocks.bearer]?.[inputs.bearer])
      .value?.trim() ?? '';
  const clientId =
    viewValueSchema
      .parse(state[blocks.clientId]?.[inputs.clientId])
      .value?.trim() ?? '';
  const errors: Record<string, string> = {};

  if (!name) {
    errors[blocks.name] = 'Enter a name.';
  }
  if (!(authValue === 'oauth' || authValue === 'bearer')) {
    errors[blocks.auth] = 'Choose OAuth or token.';
  }
  if (!(transportValue === 'http' || transportValue === 'sse')) {
    errors[blocks.transport] = 'Transport must be http or sse.';
  }
  if (authValue === 'bearer' && !bearerToken) {
    errors[blocks.bearer] = 'Enter a token.';
  }

  const parsedUrl = await mcpServerUrlSchema.safeParseAsync(urlValue ?? '');
  if (parsedUrl.success) {
    if (Object.keys(errors).length === 0) {
      return {
        data: {
          auth,
          bearerToken,
          clientId,
          name: name ?? '',
          transport,
          url: parsedUrl.data,
        },
        errors: {},
      };
    }
  } else {
    const issue = parsedUrl.error.issues[0];
    errors[blocks.url] = issue?.message ?? 'Enter a valid HTTPS URL.';
  }

  return { data: null, errors };
}
