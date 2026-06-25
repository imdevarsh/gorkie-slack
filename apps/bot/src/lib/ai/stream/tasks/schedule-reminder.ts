import type { TaskRendererEntry } from '@/types/task-renderers';
import { number, text } from './helpers';

export const scheduleReminder: TaskRendererEntry = {
  title: 'Scheduling reminder',
  request: ({ input }) => {
    const seconds = number(input, 'seconds');
    const reminder = text(input, 'text');
    return {
      details: `${seconds ?? '?'}s${reminder ? ` · ${reminder}` : ''}`,
    };
  },
  response: ({ output }) => {
    const error = text(output, 'error');
    if (error) {
      return {
        output: `Error: ${error}`,
        title: 'Reminder failed',
      };
    }
    return {
      output: `Scheduled for ${text(output, 'scheduledFor') ?? text(output, 'userId') ?? 'later'}.`,
      title: 'Scheduled reminder',
    };
  },
};
