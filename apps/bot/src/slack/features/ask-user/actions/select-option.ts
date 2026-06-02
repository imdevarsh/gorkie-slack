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
  getAskUserApprovalState,
  saveAskUserApprovalState,
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
  let approvalId = '';
  let optionId = '';
  const actionRecord = asRecord(action);
  const actionId =
    typeof actionRecord?.action_id === 'string' ? actionRecord.action_id : '';
  const actionPrefix = `${actions.interact}_`;
  if (actionId.startsWith(actionPrefix)) {
    const rest = actionId.slice(actionPrefix.length);
    const separator = rest.indexOf('_');
    command = separator === -1 ? rest : rest.slice(0, separator);
    approvalId = separator === -1 ? '' : rest.slice(separator + 1);
  }
  if (!approvalId && typeof actionRecord?.value === 'string') {
    approvalId = actionRecord.value;
  }
  if (!command && typeof actionRecord?.value === 'string') {
    try {
      const value = asRecord(JSON.parse(actionRecord.value));
      command = typeof value?.action === 'string' ? value.action : '';
      if (typeof value?.approvalId === 'string') {
        approvalId = value.approvalId;
      } else if (typeof value?.flowId === 'string') {
        approvalId = value.flowId;
      }
      optionId = typeof value?.optionId === 'string' ? value.optionId : '';
    } catch {
      command = '';
    }
  }

  const approval = approvalId
    ? await getAskUserApprovalState({
        botUserId: boltContext.botUserId,
        client,
        id: approvalId,
        teamId: body.team?.id,
        userId: body.user.id,
      })
    : null;
  const question = approval?.questions[approval.index];
  if (!approval) {
    return;
  }

  if (command === 'open') {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: askUserModal({ approval }),
    });
    return;
  }

  if (!(question && !approval.completed)) {
    return;
  }

  const selectedOption = asRecord(actionRecord?.selected_option);
  if (typeof selectedOption?.value === 'string') {
    optionId = selectedOption.value;
  }

  if (command === 'back') {
    approval.index = Math.max(0, approval.index - 1);
  } else if (command === 'skip' || command === 'continue') {
    approval.index += 1;
  } else if (command === 'choose' && optionId) {
    approval.answers[question.id] = [optionId];
  } else if (command === 'toggle') {
    const selectedOptions = Array.isArray(actionRecord?.selected_options)
      ? actionRecord.selected_options
      : [];
    approval.answers[question.id] = selectedOptions.flatMap((option) => {
      const selected = asRecord(option);
      return typeof selected?.value === 'string' ? [selected.value] : [];
    });
  }
  const shouldContinue =
    approval.index >= approval.questions.length && !approval.completed;
  if (shouldContinue) {
    approval.completed = true;
  }
  await saveAskUserApprovalState({ approval });

  const view = asRecord(body.view);
  if (typeof view?.id === 'string') {
    await client.views
      .update({
        ...(typeof view.hash === 'string' ? { hash: view.hash } : {}),
        view: askUserModal({ approval }),
        view_id: view.id,
      })
      .catch(() => undefined);
  }

  const container = asRecord(body.container);
  const message = asRecord(body.message);
  const channel = approval.message?.channel ?? container?.channel_id;
  const ts = approval.message?.ts ?? message?.ts;
  if (!(typeof channel === 'string' && typeof ts === 'string')) {
    return;
  }

  await client.chat
    .update({
      channel,
      ts,
      text: shouldContinue ? 'Thanks, got it' : 'Question for you',
      blocks: shouldContinue
        ? askUserAnsweredBlocks({ approval })
        : askUserBlocks({ approval }),
    })
    .catch(() => undefined);

  if (!shouldContinue) {
    return;
  }

  const context = {
    ...approval.context,
    client,
  };
  await getQueue(getContextId(context))
    .add(async () => {
      const result = await continueAfterAskUser({
        answers: askUserAnswerSummary({ approval }),
        context,
        messages: approval.messages,
        requestHints: approval.requestHints,
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
        { ...toLogError(error), approvalId: approval.id },
        'Failed to continue ask user approval'
      );
    });
}
