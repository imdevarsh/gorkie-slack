import { mcpServerUrlSchema } from '@repo/validators';
import { blocks } from '../../ids';
import { selectedFieldValue, textFieldValue } from '../../schema';
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
  const name = textFieldValue({ field: 'name', values: state });
  const urlValue = textFieldValue({ field: 'url', values: state });
  const transportValue =
    selectedFieldValue({ field: 'transport', values: state }) || 'http';
  const transport: Transport = transportValue === 'sse' ? 'sse' : 'http';
  const errors: Record<string, string> = {};

  if (!name) {
    errors[blocks.name] = 'Enter a name.';
  }
  if (!(transportValue === 'http' || transportValue === 'sse')) {
    errors[blocks.transport] = 'Transport must be HTTP or SSE.';
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
