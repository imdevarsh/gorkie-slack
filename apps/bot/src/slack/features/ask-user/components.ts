import { clampText } from '@repo/utils/text';
import type { ChannelAndBlocks } from '@slack/web-api/dist/types/request/chat';
import type { ViewsOpenArguments } from '@slack/web-api/dist/types/request/views';
import { actions, views } from './ids';
import { type AskUserFlow, askUserAnswerSummary } from './state';
import type { AskUserButton, AskUserOptionElement } from './types';

type AskUserModalView = ViewsOpenArguments['view'];

function actionId({ action, flow }: { action: string; flow: AskUserFlow }) {
  return `${actions.interact}_${action}_${flow.id}`;
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
          text: clampText(askUserAnswerSummary({ flow }), 900),
        },
      },
    ];
  }

  return [
    {
      type: 'card',
      title: {
        type: 'mrkdwn',
        text: `Question ${flow.index + 1} of ${flow.questions.length}`,
      },
      body: {
        type: 'mrkdwn',
        text: clampText(`*${question.title}*`, 900),
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Answer questions',
            emoji: false,
          },
          style: 'primary',
          action_id: actionId({ action: 'open', flow }),
          value: flow.id,
        },
      ],
    },
  ];
}

export function askUserModal({
  flow,
}: {
  flow: AskUserFlow;
}): AskUserModalView {
  const question = flow.questions[flow.index];
  if (!question) {
    return {
      type: 'modal',
      callback_id: views.modal,
      private_metadata: flow.id,
      title: { type: 'plain_text', text: 'Question answered' },
      close: { type: 'plain_text', text: 'Done' },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: clampText(askUserAnswerSummary({ flow }), 900),
          },
        },
      ],
    };
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
  const optionElements: AskUserOptionElement[] = options.map((option) => ({
    text: {
      type: 'plain_text',
      text: clampText(option.title, 75),
      emoji: false,
    },
    ...(option.description
      ? {
          description: {
            type: 'plain_text',
            text: clampText(option.description, 75),
            emoji: false,
          },
        }
      : {}),
    value: clampText(option.id, 75),
  }));
  const navButtons: AskUserButton[] = [];

  if (flow.index > 0) {
    navButtons.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: 'Back',
        emoji: false,
      },
      action_id: actionId({ action: 'back', flow }),
      value: flow.id,
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
      action_id: actionId({ action: 'skip', flow }),
      value: flow.id,
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
      action_id: actionId({ action: 'continue', flow }),
      value: flow.id,
    });
  }

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Question ${flow.index + 1} of ${flow.questions.length}*\n${question.title}`,
      },
    },
    {
      type: 'actions',
      block_id: `ask_user_options_${flow.index}`,
      elements: [
        question.multiSelect
          ? {
              type: 'checkboxes',
              action_id: actionId({ action: 'toggle', flow }),
              options: optionElements,
              ...(selected.length > 0
                ? {
                    initial_options: optionElements.filter((option) =>
                      selected.includes(option.value)
                    ),
                  }
                : {}),
            }
          : {
              type: 'radio_buttons',
              action_id: actionId({ action: 'choose', flow }),
              options: optionElements,
              ...(selected[0]
                ? {
                    initial_option: optionElements.find(
                      (option) => option.value === selected[0]
                    ),
                  }
                : {}),
            },
      ],
    },
    ...(navButtons.length > 0
      ? [
          {
            type: 'actions',
            block_id: `ask_user_nav_${flow.index}`,
            elements: navButtons,
          },
        ]
      : []),
  ];

  return {
    type: 'modal',
    callback_id: views.modal,
    private_metadata: flow.id,
    title: {
      type: 'plain_text',
      text: 'Question for you',
    },
    close: {
      type: 'plain_text',
      text: 'Close',
    },
    blocks,
  };
}

export function askUserAnsweredBlocks({ flow }: { flow: AskUserFlow }) {
  return [
    {
      type: 'card',
      title: {
        type: 'mrkdwn',
        text: 'Thanks, got it',
      },
      body: {
        type: 'mrkdwn',
        text: clampText(askUserAnswerSummary({ flow }), 900),
      },
    },
  ] satisfies ChannelAndBlocks['blocks'];
}
