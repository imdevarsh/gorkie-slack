import { textField } from './helpers';
import type { ToolTaskRendererEntry } from './types';

export const mermaid: ToolTaskRendererEntry = {
  title: 'Creating diagram',
  request: ({ input }) => {
    const detail = textField(input, 'title') ?? textField(input, 'code');
    return { details: detail };
  },
  response: ({ output }) => {
    const error = textField(output, 'error');
    if (error) {
      return {
        output: `Error: ${error}`,
        title: 'Diagram failed',
      };
    }
    return {
      output: `Uploaded ${textField(output, 'title') ?? 'diagram'}.`,
      title: 'Created diagram',
    };
  },
};
