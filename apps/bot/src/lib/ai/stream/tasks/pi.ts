import { textField } from './helpers';
import type { ToolTaskRendererEntry } from './types/renderers';

export const command: ToolTaskRendererEntry = {
  title: 'Running command',
  request: ({ input }) => {
    const commandText = textField(input, 'command');
    if (!commandText) {
      return {};
    }
    const detail = commandText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .slice(0, 3)
      .join(' ; ');
    return { details: detail || commandText.split('\n')[0] };
  },
};

export const file: ToolTaskRendererEntry = {
  title: 'Reading file',
  request: ({ input }) => {
    const detail = textField(input, 'path') ?? textField(input, 'file_path');
    return { details: detail };
  },
  response: ({ toolName }) => {
    if (toolName === 'edit') {
      return { output: 'Edited file.' };
    }
    if (toolName === 'fileChange') {
      return { output: 'Updated file.' };
    }
    if (toolName === 'write') {
      return { output: 'Wrote file.' };
    }
    return { output: 'Read file.' };
  },
};

export const search: ToolTaskRendererEntry = {
  title: 'Searching files',
  request: ({ input }) => {
    const detail = textField(input, 'pattern') ?? textField(input, 'path');
    return { details: detail };
  },
};
