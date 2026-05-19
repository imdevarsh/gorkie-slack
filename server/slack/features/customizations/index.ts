import { prompts } from './prompts';

export const customizations = {
  actions: [...prompts.actions],
  views: [...prompts.views],
};
