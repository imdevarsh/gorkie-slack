import { Blocks, HomeTab } from 'slack-block-builder';
import type { SlackHomeTabDto } from 'slack-block-builder/dist/internal';
import type { ScheduledTask } from '~/db/schema';
import { customInstructionsBlocks } from './_components/custom-instructions';
import { scheduledTasksBlocks } from './_components/scheduled-tasks';

export function buildHomeView(
  tasks: ScheduledTask[],
  customization: { prompt?: string } | null
): SlackHomeTabDto {
  return HomeTab()
    .blocks(
      Blocks.Header({ text: 'Gorkie' }),
      Blocks.Context().elements(
        'Your AI assistant. Customize how it behaves and manage your scheduled tasks.'
      ),
      Blocks.Divider(),
      ...customInstructionsBlocks(customization),
      Blocks.Divider(),
      ...scheduledTasksBlocks(tasks)
    )
    .buildToObject();
}
