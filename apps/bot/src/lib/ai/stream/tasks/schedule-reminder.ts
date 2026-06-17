import { clipped, numberField, textField } from './helpers';
import type { ToolTaskRenderer } from './types';

export const scheduleReminderCall: ToolTaskRenderer = ({ input }) => {
  const seconds = numberField(input, 'seconds');
  const text = textField(input, 'text');
  return {
    details: clipped(`${seconds ?? '?'}s${text ? ` · ${text}` : ''}`, 180),
    title: 'Scheduling reminder',
  };
};

export const scheduleReminderResult: ToolTaskRenderer = ({ output }) => {
  const error = textField(output, 'error');
  if (error) {
    return { output: clipped(`Error: ${error}`), title: 'Reminder failed' };
  }
  return {
    output: clipped(
      `Scheduled for ${textField(output, 'scheduledFor') ?? textField(output, 'userId') ?? 'later'}.`
    ),
    title: 'Scheduled reminder',
  };
};
