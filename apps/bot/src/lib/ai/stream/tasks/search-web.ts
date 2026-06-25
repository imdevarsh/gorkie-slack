import type { TaskRendererEntry } from '@/types/task-renderers';
import { number, plural, text, value } from './helpers';

export const searchWeb: TaskRendererEntry = {
  title: 'Searching the web',
  request: ({ input }) => ({
    details: text(input, 'query'),
  }),
  response: ({ input, output }) => {
    const count = number(output, 'resultCount') ?? 0;
    const links = value(output, 'links');
    const topLinks = Array.isArray(links)
      ? links
          .filter((link): link is string => typeof link === 'string')
          .slice(0, 3)
      : [];
    const query = text(input, 'query');
    return {
      output: `Found ${plural(count, 'web result')}${query ? ` for "${query}"` : ''}.${topLinks.length > 0 ? ` ${topLinks.join(', ')}` : ''}`,
      title: 'Searched the web',
    };
  },
};
