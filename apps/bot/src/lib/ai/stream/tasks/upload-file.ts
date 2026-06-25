import type { TaskRendererEntry } from '@/types/task-renderers';
import { bool, text } from './helpers';

export const uploadFile: TaskRendererEntry = {
  title: 'Uploading file',
  request: ({ input }) => ({
    details: text(input, 'path'),
  }),
  response: ({ input, output }) => {
    const filename =
      text(output, 'filename') ??
      text(input, 'filename') ??
      text(input, 'path') ??
      'file';
    const uploaded = bool(output, 'uploaded');
    return {
      output:
        uploaded === false
          ? `Could not upload ${filename}.`
          : `Uploaded ${filename}.`,
      title: uploaded === false ? 'File upload failed' : 'Uploaded file',
    };
  },
};
