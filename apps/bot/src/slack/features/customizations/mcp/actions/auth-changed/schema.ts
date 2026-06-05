import { selectedFieldValue, textFieldValue } from '../../schema';
import type { ModalState, SelectArgs } from '../../types';

export function parseAuthChangedPayload({
  view,
}: {
  view: SelectArgs['body']['view'];
}): ModalState {
  const values = view?.state.values;
  const auth =
    selectedFieldValue({ field: 'auth', values }) === 'bearer'
      ? 'bearer'
      : 'oauth';
  const transport =
    selectedFieldValue({ field: 'transport', values }) === 'sse'
      ? 'sse'
      : 'http';

  return {
    auth,
    bearerToken: textFieldValue({ field: 'bearer', values }),
    clientId: textFieldValue({ field: 'clientId', values }),
    name: textFieldValue({ field: 'name', values }),
    transport,
    url: textFieldValue({ field: 'url', values }),
  };
}
