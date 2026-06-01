import { asRecord } from '@repo/utils/record';
import { askUserBlocks } from '../components';
import { actions } from '../ids';
import { getAskUserFlow, saveAskUserFlow } from '../state';
import type { ButtonArgs } from '../types';

export const name = new RegExp(`^${actions.interact}_`);

export async function execute({
  ack,
  action,
  body,
  client,
}: ButtonArgs): Promise<void> {
  await ack();

  let command = '';
  let flowId = '';
  let optionId = '';
  try {
    const value = asRecord(JSON.parse(action.value ?? '{}'));
    command = typeof value?.action === 'string' ? value.action : '';
    flowId = typeof value?.flowId === 'string' ? value.flowId : '';
    optionId = typeof value?.optionId === 'string' ? value.optionId : '';
  } catch {
    command = '';
  }

  const flow = flowId ? getAskUserFlow({ id: flowId }) : null;
  const question = flow?.questions[flow.index];
  if (!(flow && question)) {
    return;
  }

  if (command === 'back') {
    flow.index = Math.max(0, flow.index - 1);
  } else if (command === 'skip' || command === 'continue') {
    flow.index += 1;
  } else if (command === 'choose' && optionId) {
    flow.answers[question.id] = [optionId];
    flow.index += 1;
  } else if (command === 'toggle' && optionId) {
    const selected = new Set(flow.answers[question.id] ?? []);
    if (selected.has(optionId)) {
      selected.delete(optionId);
    } else {
      selected.add(optionId);
    }
    flow.answers[question.id] = [...selected];
  }
  saveAskUserFlow({ flow });

  const container = asRecord(body.container);
  const message = asRecord(body.message);
  const channel = container?.channel_id;
  const ts = message?.ts;
  if (!(typeof channel === 'string' && typeof ts === 'string')) {
    return;
  }

  await client.chat
    .update({
      channel,
      ts,
      text: 'Question for you',
      blocks: askUserBlocks({ flow }),
    })
    .catch(() => undefined);
}
