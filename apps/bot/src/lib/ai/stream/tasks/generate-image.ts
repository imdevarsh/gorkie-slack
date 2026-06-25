import type { TaskRendererEntry } from '@/types/task-renderers';
import { number, plural, text } from './helpers';

export const generateImage: TaskRendererEntry = {
  title: 'Generating image',
  request: ({ input }) => ({
    details: text(input, 'prompt'),
  }),
  response: ({ output }) => {
    const uploaded = number(output, 'uploaded') ?? 0;
    return {
      output: `Uploaded ${plural(uploaded, 'image')}.`,
      title: uploaded > 0 ? 'Generated image' : 'Image generation finished',
    };
  },
};
