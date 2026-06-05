import type { ViewsOpenArguments } from '@slack/web-api';

type ModalView = ViewsOpenArguments['view'];

export function statusModal({
  text,
  title,
}: {
  text: string;
  title: string;
}): ModalView {
  return {
    type: 'modal',
    title: { type: 'plain_text', text: title },
    close: { type: 'plain_text', text: 'Done' },
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text },
      },
    ],
  };
}
