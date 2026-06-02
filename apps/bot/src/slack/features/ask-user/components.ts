import { clampText } from '@repo/utils/text';
import type { ChannelAndBlocks } from '@slack/web-api/dist/types/request/chat';
import type { ViewsOpenArguments } from '@slack/web-api/dist/types/request/views';
import { actions, views } from './ids';
import { type AskUserApprovalState, askUserAnswerSummary } from './state';
import type { AskUserButton, AskUserChoiceElement } from './types';

type AskUserModalView = ViewsOpenArguments['view'];

function actionId({
  action,
  approval,
}: {
  action: string;
  approval: AskUserApprovalState;
}) {
  return `${actions.interact}_${action}_${approval.id}`;
}

export function askUserTextBlockId({ index }: { index: number }) {
  return `ask_user_text_${index}`;
}

export function askUserOtherBlockId({ index }: { index: number }) {
  return `ask_user_other_${index}`;
}

export function askUserBlocks({
  approval,
}: {
  approval: AskUserApprovalState;
}) {
  const question = approval.questions[approval.index];
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
          text: clampText(askUserAnswerSummary({ approval }), 900),
        },
      },
    ];
  }

  return [
    {
      type: 'card',
      title: {
        type: 'mrkdwn',
        text: `Question ${approval.index + 1} of ${approval.questions.length}`,
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
          action_id: actionId({ action: 'open', approval }),
          value: approval.id,
        },
      ],
    },
  ];
}

export function askUserModal({
  approval,
}: {
  approval: AskUserApprovalState;
}): AskUserModalView {
  const question = approval.questions[approval.index];
  if (!question) {
    return {
      type: 'modal',
      callback_id: views.modal,
      private_metadata: approval.id,
      title: { type: 'plain_text', text: 'Question answered' },
      close: { type: 'plain_text', text: 'Done' },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: clampText(askUserAnswerSummary({ approval }), 900),
          },
        },
      ],
    };
  }

  const selected = approval.answers[question.id] ?? [];
  const selectedOptionIds = selected.map((value) =>
    value.startsWith('other:') ? 'other' : value
  );
  const otherValue =
    selected
      .find((value) => value.startsWith('other:'))
      ?.slice('other:'.length) ?? '';
  const choices = [
    ...question.choices,
    ...(question.allowOther
      ? [
          {
            id: 'other',
            title: question.otherPlaceholder ?? 'Describe in your own words',
          },
        ]
      : []),
  ];
  const choiceElements: AskUserChoiceElement[] = choices.map((choice) => ({
    text: {
      type: 'plain_text',
      text: clampText(choice.title, 75),
      emoji: false,
    },
    ...(choice.description
      ? {
          description: {
            type: 'plain_text',
            text: clampText(choice.description, 75),
            emoji: false,
          },
        }
      : {}),
    value: clampText(choice.id, 75),
  }));
  const navButtons: AskUserButton[] = [];

  if (approval.index > 0) {
    navButtons.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: 'Back',
        emoji: false,
      },
      action_id: actionId({ action: 'back', approval }),
      value: approval.id,
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
      action_id: actionId({ action: 'skip', approval }),
      value: approval.id,
    });
  }

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Question ${approval.index + 1} of ${approval.questions.length}*\n${question.title}`,
      },
    },
    ...(question.type === 'text'
      ? [
          {
            type: 'input',
            block_id: askUserTextBlockId({ index: approval.index }),
            optional: question.skippable !== false,
            element: {
              type: 'plain_text_input',
              action_id: actionId({ action: 'input', approval }),
              multiline: true,
              ...(selected[0] ? { initial_value: selected[0] } : {}),
            },
            label: {
              type: 'plain_text',
              text: 'Answer',
              emoji: false,
            },
          },
        ]
      : [
          {
            type: 'actions',
            block_id: `ask_user_choices_${approval.index}`,
            elements: [
              question.type === 'multi_choice'
                ? {
                    type: 'checkboxes',
                    action_id: actionId({ action: 'toggle', approval }),
                    options: choiceElements,
                    ...(selectedOptionIds.length > 0
                      ? {
                          initial_options: choiceElements.filter((option) =>
                            selectedOptionIds.includes(option.value)
                          ),
                        }
                      : {}),
                  }
                : {
                    type: 'radio_buttons',
                    action_id: actionId({ action: 'choose', approval }),
                    options: choiceElements,
                    ...(selectedOptionIds[0]
                      ? {
                          initial_option: choiceElements.find(
                            (option) => option.value === selectedOptionIds[0]
                          ),
                        }
                      : {}),
                  },
            ],
          },
        ]),
    ...(question.allowOther && selectedOptionIds.includes('other')
      ? [
          {
            type: 'input',
            block_id: askUserOtherBlockId({ index: approval.index }),
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: actionId({ action: 'other', approval }),
              ...(otherValue ? { initial_value: otherValue } : {}),
            },
            label: {
              type: 'plain_text',
              text: question.otherPlaceholder ?? 'Other',
              emoji: false,
            },
          },
        ]
      : []),
    ...(navButtons.length > 0
      ? [
          {
            type: 'actions',
            block_id: `ask_user_nav_${approval.index}`,
            elements: navButtons,
          },
        ]
      : []),
  ];

  return {
    type: 'modal',
    callback_id: views.modal,
    private_metadata: approval.id,
    title: {
      type: 'plain_text',
      text: 'Question for you',
    },
    close: {
      type: 'plain_text',
      text: 'Close',
    },
    submit: {
      type: 'plain_text',
      text:
        question.nextLabel ??
        (approval.index + 1 >= approval.questions.length ? 'Done' : 'Next'),
    },
    blocks,
  };
}

export function askUserAnsweredBlocks({
  approval,
}: {
  approval: AskUserApprovalState;
}) {
  return [
    {
      type: 'card',
      title: {
        type: 'mrkdwn',
        text: 'Thanks, got it',
      },
      body: {
        type: 'mrkdwn',
        text: clampText(askUserAnswerSummary({ approval }), 900),
      },
    },
  ] satisfies ChannelAndBlocks['blocks'];
}
