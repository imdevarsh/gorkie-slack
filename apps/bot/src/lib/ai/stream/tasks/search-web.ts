import { clipped, field, numberField, plural, textField } from './helpers';
import type { ToolTaskRenderer } from './types';

export const searchWebCall: ToolTaskRenderer = ({ input }) => ({
  details: clipped(textField(input, 'query'), 180),
  title: 'Searching the web',
});

export const searchWebResult: ToolTaskRenderer = ({ input, output }) => {
  const count = numberField(output, 'resultCount') ?? 0;
  const links = field(output, 'links');
  const topLinks = Array.isArray(links)
    ? links
        .filter((link): link is string => typeof link === 'string')
        .slice(0, 3)
    : [];
  const query = textField(input, 'query');
  return {
    output: clipped(
      `Found ${plural(count, 'web result')}${query ? ` for "${query}"` : ''}.${topLinks.length > 0 ? ` ${topLinks.join(', ')}` : ''}`
    ),
    title: 'Searched the web',
  };
};
