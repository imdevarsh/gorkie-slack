import type { TaskRendererEntry } from '@/types/task-renderers';

export const leaveThread: TaskRendererEntry = {
  title: 'Leaving thread',
  response: () => ({
    output: 'Left the thread.',
    title: 'Left thread',
  }),
};
