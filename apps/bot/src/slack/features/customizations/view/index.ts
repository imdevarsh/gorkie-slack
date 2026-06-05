import type { MCPServerWithConnection } from '@repo/db/queries';
import type { ScheduledTask } from '@repo/db/schema';
import { Blocks, HomeTab } from 'slack-block-builder';
import type { SlackHomeTabDto } from 'slack-block-builder/dist/internal';
import { customInstructionsBlocks } from './_components/custom-instructions';
import { mcpBlocks } from './_components/mcp';
import { scheduledTasksBlocks } from './_components/scheduled-tasks';

export function buildHomeView({
  tasks,
  customization,
  mcpServers,
}: {
  tasks: ScheduledTask[];
  customization: { prompt?: string } | null;
  mcpServers: MCPServerWithConnection[];
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
      ...mcpBlocks(mcpServers),
      Blocks.Divider(),
      ...scheduledTasksBlocks(tasks)
    )
    .buildToObject();
}
