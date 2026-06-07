import { mcp } from './mcp';
import { prompts } from './prompts';
import { scheduledTasks } from './scheduled-tasks';

export const customizations = {
  buttonActions: [
    ...prompts.buttonActions,
    ...scheduledTasks.buttonActions,
    ...mcp.buttonActions,
  ],
  closedViews: [...mcp.closedViews],
  inputActions: [...mcp.inputActions],
  selectActions: [...mcp.selectActions],
  submitViews: [...prompts.submitViews, ...mcp.submitViews],
};
