import { numberField, textField } from './helpers';
import type { ToolTaskRendererEntry } from './types/renderers';

export const scheduleReminder: ToolTaskRendererEntry = {
  title: 'Scheduling reminder',
  request: ({ input }) => {
    const seconds = numberField(input, 'seconds');
    const text = textField(input, 'text');
    return {
      details: `${seconds ?? '?'}s${text ? ` · ${text}` : ''}`,
    };
  },
  response: ({ output }) => {
    const error = textField(output, 'error');
    if (error) {
      return {
        output: `Error: ${error}`,
        title: 'Reminder failed',
      };
    }
    return {
      output: `Scheduled for ${textField(output, 'scheduledFor') ?? textField(output, 'userId') ?? 'later'}.`,
      title: 'Scheduled reminder',
    };
  },
};
