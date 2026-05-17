import { formatDistanceToNowStrict, isPast } from 'date-fns';
import {
  Bits,
  Blocks,
  Elements,
  HomeTab,
  Modal,
  setIfTruthy,
} from 'slack-block-builder';
import type {
  SlackHomeTabDto,
  SlackModalDto,
} from 'slack-block-builder/dist/internal';
import type { ScheduledTask } from '~/db/schema';

const MAX_PROMPT_DISPLAY = 200;
const MAX_TASK_PROMPT = 80;

function buildTaskBlock(task: ScheduledTask) {
  const destination =
    task.destinationType === 'dm' ? 'your DM' : `<#${task.destinationId}>`;
  let title = task.prompt;
  if (task.prompt.length > MAX_TASK_PROMPT) {
    title = `${task.prompt.slice(0, MAX_TASK_PROMPT)}...`;
  }

  let nextRunText = 'overdue';
  if (!isPast(task.nextRunAt)) {
    nextRunText = `in ${formatDistanceToNowStrict(task.nextRunAt, {
      roundingMethod: 'floor',
    })}`;
  }

  let lastRunStatus = '';
  if (task.lastStatus === 'success') {
    lastRunStatus = ' [ok]';
  } else if (task.lastStatus === 'error') {
    lastRunStatus = ' [error]';
  }

  let lastRunText = 'Never run';
  if (task.lastRunAt) {
    lastRunText = `${formatDistanceToNowStrict(task.lastRunAt, {
      addSuffix: true,
      roundingMethod: 'floor',
    })}${lastRunStatus}`;
  }

  return Blocks.Section({
    text: [
      `*${title}*`,
      `\`${task.cronExpression}\` (${task.timezone}) -> ${destination}`,
      `Next: ${nextRunText} · Last: ${lastRunText}`,
    ].join('\n'),
  }).accessory(
    Elements.Button({
      text: 'Cancel',
      actionId: 'home_cancel_task',
      value: task.id,
    })
      .danger()
      .confirm(
        Bits.ConfirmationDialog({
          title: 'Cancel this task?',
          text: 'This will permanently stop this scheduled task.',
          confirm: 'Yes, cancel',
          deny: 'Keep it',
        })
      )
  );
}

export function buildHomeView(
  tasks: ScheduledTask[],
  userPrompt: string | null
): SlackHomeTabDto {
  let promptDisplay = '_No custom instructions set._';
  if (userPrompt) {
    promptDisplay =
      userPrompt.length > MAX_PROMPT_DISPLAY
        ? `${userPrompt.slice(0, MAX_PROMPT_DISPLAY)}...`
        : userPrompt;
  }

  const scheduledTasksLabel =
    tasks.length > 0
      ? `*Scheduled Tasks* (${tasks.length} active)`
      : '*Scheduled Tasks*';

  return HomeTab()
    .blocks(
      Blocks.Header({ text: 'Gorkie' }),
      Blocks.Context().elements(
        'Your AI assistant. Customize how it behaves and manage your scheduled tasks.'
      ),
      Blocks.Divider(),
      Blocks.Section({
        text: `*Custom Instructions*\n${promptDisplay}`,
      }).accessory(
        Elements.Button({
          text: userPrompt ? 'Edit' : 'Add',
          actionId: 'home_edit_prompt',
        })
      ),
      setIfTruthy(
        userPrompt,
        Blocks.Actions().elements(
          Elements.Button({
            text: 'Clear instructions',
            actionId: 'home_clear_prompt',
          })
            .danger()
            .confirm(
              Bits.ConfirmationDialog({
                title: 'Clear instructions?',
                text: 'Your custom instructions will be removed.',
                confirm: 'Clear',
                deny: 'Keep',
              })
            )
        )
      ),
      Blocks.Divider(),
      Blocks.Section({ text: scheduledTasksLabel }),
      setIfTruthy(
        tasks.length === 0,
        Blocks.Context().elements(
          'No active scheduled tasks. Ask Gorkie to schedule a recurring task for you.'
        )
      ),
      tasks.map((task) => buildTaskBlock(task))
    )
    .buildToObject();
}

export function buildPromptModal(currentPrompt: string | null): SlackModalDto {
  return Modal({
    title: 'Custom Instructions',
    submit: 'Save',
    close: 'Cancel',
    callbackId: 'home_save_prompt',
  })
    .blocks(
      Blocks.Section({
        text: 'Tell Gorkie how you want it to behave in every conversation - your preferred language, tone, name, or anything else.',
      }),
      Blocks.Input({
        blockId: 'prompt_block',
        label: 'Your instructions',
      }).element(
        Elements.TextInput({
          actionId: 'prompt_input',
          multiline: true,
          maxLength: 3000,
          placeholder:
            'e.g. Always reply in Spanish. Keep responses concise. My name is Alex.',
          initialValue: currentPrompt ?? undefined,
        })
      )
    )
    .buildToObject();
}
