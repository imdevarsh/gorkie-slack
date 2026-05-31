import { mcp } from './mcp';
import { prompts } from './prompts';
import { scheduledTasks } from './scheduled-tasks';

export const customizations = {
  actions: [...prompts.actions, ...scheduledTasks.actions, ...mcp.actions],
  views: [...prompts.views, ...mcp.views],
};
