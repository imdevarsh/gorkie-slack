import { numberField, plural, textField } from './helpers';
import type { ToolTaskRendererEntry } from './types/renderers';

export const generateImage: ToolTaskRendererEntry = {
  title: 'Generating image',
  request: ({ input }) => ({
    details: textField(input, 'prompt'),
  }),
  response: ({ output }) => {
    const uploaded = numberField(output, 'uploaded') ?? 0;
    return {
      output: `Uploaded ${plural(uploaded, 'image')}.`,
      title: uploaded > 0 ? 'Generated image' : 'Image generation finished',
    };
  },
};
