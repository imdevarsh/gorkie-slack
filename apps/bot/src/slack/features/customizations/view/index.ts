import type { ScheduledTask } from '@repo/db/schema';
import { Blocks, HomeTab } from 'slack-block-builder';
import type { SlackHomeTabDto } from 'slack-block-builder/dist/internal';
import { customInstructionsBlocks } from './_components/custom-instructions';
import { dataTrainingBlocks } from './_components/data-training';
import { scheduledTasksBlocks } from './_components/scheduled-tasks';

export function buildHomeView({
  tasks,
  customization,
}: {
  tasks: ScheduledTask[];
  customization: { prompt?: string; allowTraining?: boolean } | null;
}): SlackHomeTabDto {
  return HomeTab()
    .blocks(
      Blocks.Header({ text: 'Gorkie' }),
      Blocks.Context().elements(
        'Your AI assistant. Customize how it behaves and manage your scheduled tasks.'
      ),
      Blocks.Divider(),
      ...customInstructionsBlocks(customization),
      Blocks.Divider(),
      ...dataTrainingBlocks(customization?.allowTraining ?? true),
      Blocks.Divider(),
      ...scheduledTasksBlocks(tasks)
    )
    .buildToObject();
}
