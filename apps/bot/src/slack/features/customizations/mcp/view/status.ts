import type { ViewsOpenArguments } from '@slack/web-api';
import { Blocks, Modal } from 'slack-block-builder';

type ModalView = ViewsOpenArguments['view'];

export function statusModal({
  text,
  title,
}: {
  text: string;
  title: string;
}): ModalView {
  return Modal({ close: 'Done', title })
    .blocks(Blocks.Section({ text }))
    .buildToObject();
}
