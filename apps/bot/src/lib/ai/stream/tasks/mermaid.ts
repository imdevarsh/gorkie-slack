import { clipped, textField } from './helpers';
import type { ToolTaskRenderer } from './types';

export const mermaidCall: ToolTaskRenderer = ({ input }) => ({
  details: clipped(textField(input, 'title') ?? textField(input, 'code'), 180),
  title: 'Creating diagram',
});

export const mermaidResult: ToolTaskRenderer = ({ output }) => {
  const error = textField(output, 'error');
  if (error) {
    return { output: clipped(`Error: ${error}`), title: 'Diagram failed' };
  }
  return {
    output: clipped(`Uploaded ${textField(output, 'title') ?? 'diagram'}.`),
    title: 'Created diagram',
  };
};
