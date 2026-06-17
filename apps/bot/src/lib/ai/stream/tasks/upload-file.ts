import { booleanField, clipped, textField } from './helpers';
import type { ToolTaskRenderer } from './types';

export const uploadFileCall: ToolTaskRenderer = ({ input }) => ({
  details: clipped(textField(input, 'path'), 180),
  title: 'Uploading file',
});

export const uploadFileResult: ToolTaskRenderer = ({ input, output }) => {
  const filename =
    textField(output, 'filename') ??
    textField(input, 'filename') ??
    textField(input, 'path') ??
    'file';
  const uploaded = booleanField(output, 'uploaded');
  return {
    output: clipped(
      uploaded === false
        ? `Could not upload ${filename}.`
        : `Uploaded ${filename}.`
    ),
    title: uploaded === false ? 'File upload failed' : 'Uploaded file',
  };
};
