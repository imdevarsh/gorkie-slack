import type { ToolTaskRendererEntry } from './types';

export const leaveThread: ToolTaskRendererEntry = {
  title: 'Leaving thread',
  response: () => ({
    output: 'Left the thread.',
    title: 'Left thread',
  }),
};
