import { clipped, numberField, plural, textField } from './helpers';
import type { ToolTaskRenderer } from './types';

export const searchSlackCall: ToolTaskRenderer = ({ input }) => ({
  details: clipped(textField(input, 'query'), 180),
  title: 'Searching Slack',
});

export const searchSlackResult: ToolTaskRenderer = ({ input, output }) => {
  const error = textField(output, 'error');
  if (error) {
    return { output: clipped(`Error: ${error}`), title: 'Slack search failed' };
  }
  const count = numberField(output, 'resultCount') ?? 0;
  const query = textField(input, 'query');
  return {
    output: clipped(
      `Found ${plural(count, 'Slack result')}${query ? ` for "${query}"` : ''}.`
    ),
    title: 'Searched Slack',
  };
};
