import type { TaskRendererEntry } from '@/types/task-renderers';
import { text } from './helpers';

export const command: TaskRendererEntry = {
  title: 'Running command',
  request: ({ input }) => {
    const commandText = text(input, 'command');
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

export const file: TaskRendererEntry = {
  title: 'Reading file',
  request: ({ input }) => {
    const detail = text(input, 'path') ?? text(input, 'file_path');
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

export const search: TaskRendererEntry = {
  title: 'Searching files',
  request: ({ input }) => {
    const detail = text(input, 'pattern') ?? text(input, 'path');
    return { details: detail };
  },
};
