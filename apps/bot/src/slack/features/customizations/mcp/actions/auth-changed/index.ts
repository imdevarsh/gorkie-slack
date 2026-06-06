import { toLogError } from '@repo/utils/error';
import logger from '@/lib/logger';
import { actions } from '../../ids';
import {
  parseModalState,
  selectedFieldValue,
  textFieldState,
} from '../../schema';
import type { SelectArgs } from '../../types';
import { addModal } from '../../view';

export const name = actions.auth;

export async function execute({
  ack,
  body,
  client,
}: SelectArgs): Promise<void> {
  await ack();
  const view = body.view;
  if (!view?.id) {
    return;
  }

  const values = view.state.values;
  const previous = parseModalState({ metadata: view.private_metadata });
  const auth =
    selectedFieldValue({ field: 'auth', values }) === 'bearer'
      ? 'bearer'
      : 'oauth';
  const transport =
    selectedFieldValue({ field: 'transport', values }) === 'sse'
      ? 'sse'
      : 'http';

  await client.views
    .update({
      hash: view.hash,
      view: addModal({
        auth,
        bearerToken:
          textFieldState({ field: 'bearer', values }) ?? previous.bearerToken,
        clientId:
          textFieldState({ field: 'clientId', values }) ?? previous.clientId,
        name: textFieldState({ field: 'name', values }) ?? previous.name,
        transport,
        url: textFieldState({ field: 'url', values }) ?? previous.url,
      }),
      view_id: view.id,
    })
    .catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), userId: body.user.id, viewId: view.id },
        'Failed to update MCP auth modal'
      );
    });
}
