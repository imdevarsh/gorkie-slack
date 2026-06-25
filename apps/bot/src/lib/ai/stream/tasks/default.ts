import type { DefaultTaskRenderer } from '@/types/task-renderers';
import { errorOutput, text } from './helpers';

export const defaultTool: DefaultTaskRenderer = {
  request: ({ input, toolName }) => {
    const detail =
      text(input, 'command') ??
      text(input, 'file_path') ??
      text(input, 'pattern') ??
      text(input, 'path') ??
      text(input, 'query');
    return {
      details: detail ? `${toolName}: ${detail}` : undefined,
    };
  },
  response: ({ output }) => ({
    output:
      (typeof output === 'string' && output.trim() ? output : undefined) ??
      text(output, 'text') ??
      text(output, 'error') ??
      'Completed.',
  }),
  error: ({ output }) => ({
    output: errorOutput(output),
  }),
};
