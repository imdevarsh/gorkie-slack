import { booleanField, textField } from './helpers';
import type { ToolTaskRendererEntry } from './types/renderers';

export const uploadFile: ToolTaskRendererEntry = {
  title: 'Uploading file',
  request: ({ input }) => ({
    details: textField(input, 'path'),
  }),
  response: ({ input, output }) => {
    const filename =
      textField(output, 'filename') ??
      textField(input, 'filename') ??
      textField(input, 'path') ??
      'file';
    const uploaded = booleanField(output, 'uploaded');
    return {
      output:
        uploaded === false
          ? `Could not upload ${filename}.`
          : `Uploaded ${filename}.`,
      title: uploaded === false ? 'File upload failed' : 'Uploaded file',
    };
  },
};
