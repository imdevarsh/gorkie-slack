import { toLogError } from '@repo/utils/error';
import { asRecord } from '@repo/utils/record';
import logger from '@/lib/logger';
import { getQueue } from '@/lib/queue';
import { continueAfterAskUser } from '@/slack/events/message-create/utils/respond';
import { getContextId } from '@/utils/context';
import {
  askUserAnsweredBlocks,
  askUserModal,
  askUserOtherBlockId,
  askUserTextBlockId,
} from '../components';
import { views } from '../ids';
import {
  askUserAnswerSummary,
  getAskUserApprovalState,
  saveAskUserApprovalState,
} from '../state';
import type { SubmitArgs } from '../types';

export const name = views.modal;

function firstInputValue({ block }: { block: unknown }): string {
  const record = asRecord(block);
  const input = Object.values(record ?? {})
    .map((value) => asRecord(value))
    .find((value) => typeof value?.value === 'string');
  return typeof input?.value === 'string' ? input.value.trim() : '';
}

export async function execute({
  ack,
  body,
  client,
  context: boltContext,
  view,
}: SubmitArgs): Promise<void> {
  const approvalId = view.private_metadata;
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
  if (!(approval && question) || approval.completed) {
    await ack();
    return;
  }

  const values = view.state.values;
  if (question.type === 'text') {
    const text = firstInputValue({
      block: values[askUserTextBlockId({ index: approval.index })],
    });
    approval.answers[question.id] = text ? [text] : [];
  } else if (question.allowOther) {
    const selected = approval.answers[question.id] ?? [];
    if (selected.some((value) => value === 'other')) {
      const text = firstInputValue({
        block: values[askUserOtherBlockId({ index: approval.index })],
      });
      approval.answers[question.id] = [
        ...selected.filter((value) => value !== 'other'),
        ...(text ? [`other:${text}`] : ['other']),
      ];
    }
  }

  approval.index += 1;
  const shouldContinue =
    approval.index >= approval.questions.length && !approval.completed;
  if (shouldContinue) {
    approval.completed = true;
  }
  await saveAskUserApprovalState({ approval });

  if (!shouldContinue) {
    await ack({
      response_action: 'update',
      view: askUserModal({ approval }),
    });
    return;
  }

  await ack();

  if (approval.message) {
    await client.chat
      .update({
        channel: approval.message.channel,
        ts: approval.message.ts,
        text: 'Thanks, got it',
        blocks: askUserAnsweredBlocks({ approval }),
      })
      .catch(() => undefined);
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
