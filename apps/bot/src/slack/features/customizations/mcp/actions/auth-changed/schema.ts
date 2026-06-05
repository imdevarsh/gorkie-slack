import { blocks, inputs } from '../../ids';
import { viewSelectedSchema, viewValueSchema } from '../../schema';
import type { ModalState, SelectArgs } from '../../types';

export function parseAuthChangedPayload({
  view,
}: {
  view: SelectArgs['body']['view'];
}): ModalState {
  const values = view?.state.values;
  const auth =
    viewSelectedSchema.parse(values?.[blocks.auth]?.[inputs.auth])
      .selected_option?.value === 'bearer'
      ? 'bearer'
      : 'oauth';
  const transport =
    viewSelectedSchema.parse(values?.[blocks.transport]?.[inputs.transport])
      .selected_option?.value === 'sse'
      ? 'sse'
      : 'http';

  return {
    auth,
    bearerToken:
      viewValueSchema
        .parse(values?.[blocks.bearer]?.[inputs.bearer])
        .value?.trim() ?? '',
    clientId:
      viewValueSchema
        .parse(values?.[blocks.clientId]?.[inputs.clientId])
        .value?.trim() ?? '',
    name:
      viewValueSchema
        .parse(values?.[blocks.name]?.[inputs.name])
        .value?.trim() ?? '',
    transport,
    url:
      viewValueSchema.parse(values?.[blocks.url]?.[inputs.url]).value?.trim() ??
      '',
  };
}
