import { mcpServerUrlSchema } from '@repo/validators';
import { blocks, inputs } from '../../ids';
import { viewSelectedSchema, viewValueSchema } from '../../schema';
import type { SubmitArgs, Transport } from '../../types';

export async function parseBaseFields({
  view,
}: {
  view: SubmitArgs['view'];
}): Promise<
  | {
      data: {
        name: string;
        transport: Transport;
        url: string;
      };
      errors: Record<string, string>;
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
  const transportValue =
    viewSelectedSchema.parse(state[blocks.transport]?.[inputs.transport])
      .selected_option?.value ?? 'http';
  const transport: Transport = transportValue === 'sse' ? 'sse' : 'http';
  const errors: Record<string, string> = {};

  if (!name) {
    errors[blocks.name] = 'Enter a name.';
  }
  if (!(transportValue === 'http' || transportValue === 'sse')) {
    errors[blocks.transport] = 'Transport must be http or sse.';
  }

  const parsedUrl = await mcpServerUrlSchema.safeParseAsync(urlValue ?? '');
  if (!parsedUrl.success) {
    const issue = parsedUrl.error.issues[0];
    errors[blocks.url] = issue?.message ?? 'Enter a valid HTTPS URL.';
  }

  if (Object.keys(errors).length > 0 || !parsedUrl.success) {
    return { data: null, errors };
  }

  return {
    data: {
      name: name ?? '',
      transport,
      url: parsedUrl.data,
    },
    errors: {},
  };
}
