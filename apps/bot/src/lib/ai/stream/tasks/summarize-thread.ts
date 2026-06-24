import { numberField, plural, textField } from './helpers';
import type { ToolTaskRendererEntry } from './types/renderers';

export const summarizeThread: ToolTaskRendererEntry = {
  title: 'Summarizing thread',
  request: ({ input }) => {
    const detail =
      textField(input, 'threadId') ?? textField(input, 'instructions');
    return { details: detail };
  },
  response: ({ output }) => {
    const error = textField(output, 'error');
    if (error) {
      return {
        output: `Error: ${error}`,
        title: 'Summary failed',
      };
    }
    const count = numberField(output, 'messageCount');
    return {
      output:
        count === undefined ? undefined : `Read ${plural(count, 'message')}.`,
      title: 'Summarized thread',
    };
  },
};
