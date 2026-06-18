import { field, numberField, plural, textField } from './helpers';
import type { ToolTaskRendererEntry } from './types';

export const searchWeb: ToolTaskRendererEntry = {
  title: 'Searching the web',
  request: ({ input }) => ({
    details: textField(input, 'query'),
  }),
  response: ({ input, output }) => {
    const count = numberField(output, 'resultCount') ?? 0;
    const links = field(output, 'links');
    const topLinks = Array.isArray(links)
      ? links
          .filter((link): link is string => typeof link === 'string')
          .slice(0, 3)
      : [];
    const query = textField(input, 'query');
    return {
      output: `Found ${plural(count, 'web result')}${query ? ` for "${query}"` : ''}.${topLinks.length > 0 ? ` ${topLinks.join(', ')}` : ''}`,
      title: 'Searched the web',
    };
  },
};
