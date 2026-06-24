import type { ToolTaskRendererEntry } from '@/types/task-renderers';
import { textField } from './helpers';

export const getFile: ToolTaskRendererEntry = {
  title: 'Downloading file',
  request: ({ input }) => ({ details: textField(input, 'file') }),
  response: ({ output }) => ({
    output: `Downloaded ${textField(output, 'filename') ?? 'file'}.`,
    title: 'Downloaded file',
  }),
};
