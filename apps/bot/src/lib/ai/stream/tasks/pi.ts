import { textField } from './helpers';
import type { ToolTaskRendererEntry } from './types';

export const command: ToolTaskRendererEntry = {
  title: 'Running command',
  request: ({ input }) => ({
    details: textField(input, 'command'),
  }),
};

export const file: ToolTaskRendererEntry = {
  title: 'Reading file',
  request: ({ input }) => {
    const detail = textField(input, 'path') ?? textField(input, 'file_path');
    return { details: detail };
  },
  response: ({ input }) => ({
    output: textField(input, 'path') ?? textField(input, 'file_path'),
  }),
};

export const search: ToolTaskRendererEntry = {
  title: 'Searching files',
  request: ({ input }) => {
    const detail = textField(input, 'pattern') ?? textField(input, 'path');
    return { details: detail };
  },
};
