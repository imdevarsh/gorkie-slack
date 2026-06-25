import type { TaskRendererEntry } from '@/types/task-renderers';
import { number, plural, text } from './helpers';

export const summarizeThread: TaskRendererEntry = {
  title: 'Summarizing thread',
  request: ({ input }) => {
    const detail = text(input, 'threadId') ?? text(input, 'instructions');
    return { details: detail };
  },
  response: ({ output }) => {
    const error = text(output, 'error');
    if (error) {
      return {
        output: `Error: ${error}`,
        title: 'Summary failed',
      };
    }
    const count = number(output, 'messageCount');
    return {
      output:
        count === undefined ? undefined : `Read ${plural(count, 'message')}.`,
      title: 'Summarized thread',
    };
  },
};
