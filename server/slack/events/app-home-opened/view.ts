import { formatDistanceToNowStrict, isPast } from 'date-fns';
import {
  Bits,
  Blocks,
  Elements,
  HomeTab,
  setIfTruthy,
} from 'slack-block-builder';
import type { SlackHomeTabDto } from 'slack-block-builder/dist/internal';
import { appHome } from '~/config';
import type { ScheduledTask } from '~/db/schema';

function buildTaskBlock(task: ScheduledTask) {
  const destination =
    task.destinationType === 'dm' ? 'your DM' : `<#${task.destinationId}>`;
  const title =
    task.prompt.length > appHome.maxTaskPrompt
      ? `${task.prompt.slice(0, appHome.maxTaskPrompt)}...`
      : task.prompt;

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

  const lastRunText = task.lastRunAt
    ? `${formatDistanceToNowStrict(task.lastRunAt, {
        addSuffix: true,
        roundingMethod: 'floor',
      })}${lastRunStatus}`
    : 'Never run';

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
  customization: { prompt?: string } | null
): SlackHomeTabDto {
  const userPrompt = customization?.prompt ?? null;
  let promptDisplay = '_No custom instructions set._';
  if (userPrompt) {
    promptDisplay =
      userPrompt.length > appHome.maxPromptDisplay
        ? `${userPrompt.slice(0, appHome.maxPromptDisplay)}...`
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
