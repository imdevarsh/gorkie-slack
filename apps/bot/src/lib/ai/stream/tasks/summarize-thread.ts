import { clipped, numberField, plural, textField } from './helpers';
import type { ToolTaskRenderer } from './types';

export const summarizeThreadCall: ToolTaskRenderer = ({ input }) => ({
  details: clipped(
    textField(input, 'threadId') ?? textField(input, 'instructions'),
    180
  ),
  title: 'Summarizing thread',
});

export const summarizeThreadResult: ToolTaskRenderer = ({ output }) => {
  const count = numberField(output, 'messageCount');
  return {
    output:
      count === undefined
        ? undefined
        : clipped(`Read ${plural(count, 'message')}.`),
    title: 'Summarized thread',
  };
};
