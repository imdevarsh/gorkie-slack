import type { ToolTaskRendererEntry } from '@/types/task-renderers';
import { numberField, plural, textField } from './helpers';

export const searchSlack: ToolTaskRendererEntry = {
  title: 'Searching Slack',
  request: ({ input }) => ({
    details: textField(input, 'query'),
  }),
  response: ({ input, output }) => {
    const error = textField(output, 'error');
    if (error) {
      return {
        output: `Error: ${error}`,
        title: 'Slack search failed',
      };
    }
    const count = numberField(output, 'resultCount') ?? 0;
    const query = textField(input, 'query');
    return {
      output: `Found ${plural(count, 'Slack result')}${query ? ` for "${query}"` : ''}.`,
      title: 'Searched Slack',
    };
  },
};
