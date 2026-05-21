import { prompts } from "./prompts";
import { scheduledTasks } from "./scheduled-tasks";

export const customizations = {
  actions: [...prompts.actions, ...scheduledTasks.actions],
  views: [...prompts.views],
};
