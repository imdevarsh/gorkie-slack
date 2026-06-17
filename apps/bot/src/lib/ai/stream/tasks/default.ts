import { clipped, errorOutput, textField } from './helpers';
import type { ToolTaskRenderer } from './types';

export const defaultToolCall: ToolTaskRenderer = ({ input, toolName }) => {
  const detail =
    textField(input, 'command') ??
    textField(input, 'file_path') ??
    textField(input, 'pattern') ??
    textField(input, 'path') ??
    textField(input, 'query');
  return {
    details: clipped(detail ? `${toolName}: ${detail}` : undefined, 180),
  };
};

export const defaultToolResult: ToolTaskRenderer = ({ output }) => ({
  output: clipped(
    typeof output === 'string'
      ? output
      : (textField(output, 'text') ?? textField(output, 'error'))
  ),
});

export const defaultToolError: ToolTaskRenderer = ({ output }) => ({
  output: errorOutput(output),
});
