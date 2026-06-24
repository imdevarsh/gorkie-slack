import { textField } from './helpers';
import type { ToolTaskRendererEntry } from './types/renderers';

export const getFile: ToolTaskRendererEntry = {
  title: 'Downloading file',
  request: ({ input }) => ({ details: textField(input, 'file') }),
  response: ({ output }) => ({
    output: `Downloaded ${textField(output, 'filename') ?? 'file'}.`,
    title: 'Downloaded file',
  }),
};
