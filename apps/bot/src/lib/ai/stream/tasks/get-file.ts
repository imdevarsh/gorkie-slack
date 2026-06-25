import type { TaskRendererEntry } from '@/types/task-renderers';
import { text } from './helpers';

export const getFile: TaskRendererEntry = {
  title: 'Downloading file',
  request: ({ input }) => ({ details: text(input, 'file') }),
  response: ({ output }) => ({
    output: `Downloaded ${text(output, 'filename') ?? 'file'}.`,
    title: 'Downloaded file',
  }),
};
