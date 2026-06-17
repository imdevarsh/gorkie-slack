import { clipped, textField } from './helpers';
import type { ToolTaskRenderer } from './types';

export const commandCall: ToolTaskRenderer = ({ input }) => ({
  details: clipped(textField(input, 'command'), 180),
  title: 'Running command',
});

export const fileCall: ToolTaskRenderer = ({ input, toolName }) => {
  let title = 'Reading file';
  if (toolName === 'write') {
    title = 'Writing file';
  }
  if (toolName === 'edit') {
    title = 'Editing file';
  }
  return {
    details: clipped(
      textField(input, 'path') ?? textField(input, 'file_path'),
      180
    ),
    title,
  };
};

export const searchCall: ToolTaskRenderer = ({ input, toolName }) => ({
  details: clipped(
    textField(input, 'pattern') ?? textField(input, 'path'),
    180
  ),
  title: toolName === 'glob' ? 'Finding files' : 'Searching files',
});
