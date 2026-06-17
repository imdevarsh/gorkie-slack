import { clipped, numberField, plural, textField } from './helpers';
import type { ToolTaskRenderer } from './types';

export const generateImageCall: ToolTaskRenderer = ({ input }) => ({
  details: clipped(textField(input, 'prompt'), 180),
  title: 'Generating image',
});

export const generateImageResult: ToolTaskRenderer = ({ output }) => {
  const uploaded = numberField(output, 'uploaded') ?? 0;
  return {
    output: clipped(`Uploaded ${plural(uploaded, 'image')}.`),
    title: uploaded > 0 ? 'Generated image' : 'Image generation finished',
  };
};
