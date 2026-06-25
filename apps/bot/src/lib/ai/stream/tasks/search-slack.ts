import type { TaskRendererEntry } from '@/types/task-renderers';
import { number, plural, text } from './helpers';

export const searchSlack: TaskRendererEntry = {
  title: 'Searching Slack',
  request: ({ input }) => ({
    details: text(input, 'query'),
  }),
  response: ({ input, output }) => {
    const error = text(output, 'error');
    if (error) {
      return {
        output: `Error: ${error}`,
        title: 'Slack search failed',
      };
    }
    const count = number(output, 'resultCount') ?? 0;
    const query = text(input, 'query');
    return {
      output: `Found ${plural(count, 'Slack result')}${query ? ` for "${query}"` : ''}.`,
      title: 'Searched Slack',
    };
  },
};
