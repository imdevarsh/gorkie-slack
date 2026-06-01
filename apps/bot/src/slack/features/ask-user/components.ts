import { clampText } from '@repo/utils/text';
import type { ChannelAndBlocks } from '@slack/web-api/dist/types/request/chat';
import { actions } from './ids';
import type { AskUserFlow, AskUserOption } from './state';
import type { AskUserButton } from './types';

function actionValue({
  action,
  flowId,
  optionId,
}: {
  action: string;
  flowId: string;
  optionId?: string;
}) {
  return JSON.stringify({ action, flowId, optionId });
}

function actionId({
  action,
  flow,
  id,
}: {
  action: string;
  flow: AskUserFlow;
  id: string;
}) {
  return `${actions.interact}_${flow.index}_${action}_${id}`;
}

function optionLine({
  index,
  option,
  selected,
}: {
  index: number;
  option: AskUserOption;
  selected: boolean;
}) {
  const marker = selected ? '[x]' : `[${index + 1}]`;
  const description = option.description ? ` ${option.description}` : '';
  return `${marker} *${option.title}*${description}`;
}

function answerSummary({ flow }: { flow: AskUserFlow }) {
  return flow.questions
    .map((question) => {
      const selected = flow.answers[question.id] ?? [];
      const titles = selected
        .map(
          (optionId) =>
            question.options.find((option) => option.id === optionId)?.title ??
            (optionId === 'other'
              ? (question.otherPlaceholder ?? 'Other')
              : null) ??
            optionId
        )
        .join(', ');
      return `${question.title}: ${titles || 'Skipped'}`;
    })
    .join('\n');
}

export function askUserBlocks({ flow }: { flow: AskUserFlow }) {
  const question = flow.questions[flow.index];
  if (!question) {
    return [
      {
        type: 'card',
        title: {
          type: 'mrkdwn',
          text: 'Thanks, got it',
        },
        body: {
          type: 'mrkdwn',
          text: clampText(answerSummary({ flow }), 200),
        },
      },
    ];
  }

  const selected = flow.answers[question.id] ?? [];
  const options = [
    ...question.options,
    ...(question.allowOther
      ? [
          {
            id: 'other',
            title: question.otherPlaceholder ?? 'Describe in your own words',
          },
        ]
      : []),
  ];
  const optionText = options
    .map((option, index) =>
      optionLine({
        index,
        option,
        selected: selected.includes(option.id),
      })
    )
    .join('\n');
  const optionAction = question.multiSelect ? 'toggle' : 'choose';
  const optionButtons: AskUserButton[] = options.map((option) => ({
    type: 'button',
    text: {
      type: 'plain_text',
      text: clampText(
        question.multiSelect && selected.includes(option.id)
          ? `[x] ${option.title}`
          : option.title,
        75
      ),
      emoji: false,
    },
    ...(question.multiSelect && selected.includes(option.id)
      ? { style: 'primary' }
      : {}),
    action_id: actionId({ action: optionAction, flow, id: option.id }),
    value: actionValue({
      action: optionAction,
      flowId: flow.id,
      optionId: option.id,
    }),
  }));
  const navButtons: typeof optionButtons = [];

  if (flow.index > 0) {
    navButtons.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: 'Back',
        emoji: false,
      },
      action_id: actionId({ action: 'back', flow, id: 'back' }),
      value: actionValue({ action: 'back', flowId: flow.id }),
    });
  }

  if (question.skippable !== false) {
    navButtons.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: 'Skip',
        emoji: false,
      },
      action_id: actionId({ action: 'skip', flow, id: 'skip' }),
      value: actionValue({ action: 'skip', flowId: flow.id }),
    });
  }

  if (question.multiSelect) {
    navButtons.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: question.nextLabel ?? 'Continue',
        emoji: false,
      },
      style: 'primary',
      action_id: actionId({ action: 'continue', flow, id: 'continue' }),
      value: actionValue({ action: 'continue', flowId: flow.id }),
    });
  }

  const blocks: ChannelAndBlocks['blocks'] = [
    {
      type: 'card',
      title: {
        type: 'mrkdwn',
        text: `Question ${flow.index + 1} of ${flow.questions.length}`,
      },
      body: {
        type: 'mrkdwn',
        text: clampText(`*${question.title}*\n${optionText}`, 200),
      },
    },
  ];

  for (let index = 0; index < optionButtons.length; index += 5) {
    blocks.push({
      type: 'actions',
      elements: optionButtons.slice(index, index + 5),
    });
  }

  if (navButtons.length > 0) {
    blocks.push({
      type: 'actions',
      elements: navButtons,
    });
  }

  return blocks;
}
