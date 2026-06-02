import { toLogError } from '@repo/utils/error';
import { asRecord } from '@repo/utils/record';
import logger from '@/lib/logger';
import { getQueue } from '@/lib/queue';
import { continueAfterAskUser } from '@/slack/events/message-create/utils/respond';
import { getContextId } from '@/utils/context';
import {
  askUserAnsweredBlocks,
  askUserBlocks,
  askUserModal,
} from '../components';
import { actions } from '../ids';
import {
  askUserAnswerSummary,
  getAskUserFlow,
  saveAskUserFlow,
} from '../state';
import type { ActionArgs } from '../types';

export const name = new RegExp(`^${actions.interact}_`);

export async function execute({
  ack,
  action,
  body,
  client,
  context: boltContext,
}: ActionArgs): Promise<void> {
  await ack();

  let command = '';
  let flowId = '';
  let optionId = '';
  const actionRecord = asRecord(action);
  const actionId =
    typeof actionRecord?.action_id === 'string' ? actionRecord.action_id : '';
  const actionPrefix = `${actions.interact}_`;
  if (actionId.startsWith(actionPrefix)) {
    const rest = actionId.slice(actionPrefix.length);
    const separator = rest.indexOf('_');
    command = separator === -1 ? rest : rest.slice(0, separator);
    flowId = separator === -1 ? '' : rest.slice(separator + 1);
  }
  if (!flowId && typeof actionRecord?.value === 'string') {
    flowId = actionRecord.value;
  }
  if (!command && typeof actionRecord?.value === 'string') {
    try {
      const value = asRecord(JSON.parse(actionRecord.value));
      command = typeof value?.action === 'string' ? value.action : '';
      flowId = typeof value?.flowId === 'string' ? value.flowId : flowId;
      optionId = typeof value?.optionId === 'string' ? value.optionId : '';
    } catch {
      command = '';
    }
  }

  const flow = flowId
    ? await getAskUserFlow({
        botUserId: boltContext.botUserId,
        client,
        id: flowId,
        teamId: body.team?.id,
        userId: body.user.id,
      })
    : null;
  const question = flow?.questions[flow.index];
  if (!flow) {
    return;
  }

  if (command === 'open') {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: askUserModal({ flow }),
    });
    return;
  }

  if (!(question && !flow.completed)) {
    return;
  }

  const selectedOption = asRecord(actionRecord?.selected_option);
  if (typeof selectedOption?.value === 'string') {
    optionId = selectedOption.value;
  }

  if (command === 'back') {
    flow.index = Math.max(0, flow.index - 1);
  } else if (command === 'skip' || command === 'continue') {
    flow.index += 1;
  } else if (command === 'choose' && optionId) {
    flow.answers[question.id] = [optionId];
    flow.index += 1;
  } else if (command === 'toggle') {
    const selectedOptions = Array.isArray(actionRecord?.selected_options)
      ? actionRecord.selected_options
      : [];
    flow.answers[question.id] = selectedOptions.flatMap((option) => {
      const selected = asRecord(option);
      return typeof selected?.value === 'string' ? [selected.value] : [];
    });
  }
  const shouldContinue = flow.index >= flow.questions.length && !flow.completed;
  if (shouldContinue) {
    flow.completed = true;
  }
  await saveAskUserFlow({ flow });

  const view = asRecord(body.view);
  if (typeof view?.id === 'string') {
    await client.views
      .update({
        ...(typeof view.hash === 'string' ? { hash: view.hash } : {}),
        view: askUserModal({ flow }),
        view_id: view.id,
      })
      .catch(() => undefined);
  }

  const container = asRecord(body.container);
  const message = asRecord(body.message);
  const channel = flow.message?.channel ?? container?.channel_id;
  const ts = flow.message?.ts ?? message?.ts;
  if (!(typeof channel === 'string' && typeof ts === 'string')) {
    return;
  }

  await client.chat
    .update({
      channel,
      ts,
      text: shouldContinue ? 'Thanks, got it' : 'Question for you',
      blocks: shouldContinue
        ? askUserAnsweredBlocks({ flow })
        : askUserBlocks({ flow }),
    })
    .catch(() => undefined);

  if (!shouldContinue) {
    return;
  }

  const context = {
    ...flow.context,
    client,
  };
  await getQueue(getContextId(context))
    .add(async () => {
      const result = await continueAfterAskUser({
        answers: askUserAnswerSummary({ flow }),
        context,
        messages: flow.messages,
        requestHints: flow.requestHints,
      });
      if (!result.success && result.error && context.event.channel) {
        await client.chat.postMessage({
          channel: context.event.channel,
          thread_ts: context.event.thread_ts ?? context.event.ts,
          text: result.error,
        });
      }
    })
    .catch((error: unknown) => {
      logger.error(
        { ...toLogError(error), flowId: flow.id },
        'Failed to continue ask user flow'
      );
    });
}
