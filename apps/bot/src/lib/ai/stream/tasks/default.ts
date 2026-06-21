import { errorOutput, textField } from './helpers';
import type { DefaultToolTaskRenderer } from './types';

export const defaultTool: DefaultToolTaskRenderer = {
  request: ({ input, toolName }) => {
    const detail =
      textField(input, 'command') ??
      textField(input, 'file_path') ??
      textField(input, 'pattern') ??
      textField(input, 'path') ??
      textField(input, 'query');
    return {
      details: detail ? `${toolName}: ${detail}` : undefined,
    };
  },
  response: ({ output }) => ({
    output:
      (typeof output === 'string' && output.trim() ? output : undefined) ??
      textField(output, 'text') ??
      textField(output, 'error') ??
      'Completed.',
  }),
  error: ({ output }) => ({
    output: errorOutput(output),
  }),
};
