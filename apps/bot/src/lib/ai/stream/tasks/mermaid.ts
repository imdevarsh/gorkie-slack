import type { TaskRendererEntry } from '@/types/task-renderers';
import { text } from './helpers';

export const mermaid: TaskRendererEntry = {
  title: 'Creating diagram',
  request: ({ input }) => {
    const detail = text(input, 'title') ?? text(input, 'code');
    return { details: detail };
  },
  response: ({ output }) => {
    const error = text(output, 'error');
    if (error) {
      return {
        output: `Error: ${error}`,
        title: 'Diagram failed',
      };
    }
    return {
      output: `Uploaded ${text(output, 'title') ?? 'diagram'}.`,
      title: 'Created diagram',
    };
  },
};
