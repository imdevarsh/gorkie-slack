import { clamp } from '@/lib/utils/text';
import { resultErrorOutput } from './helpers';
import { defaultTool, toolRenderers } from './renderers';

const REQUEST_DETAILS_MAX_LENGTH = 180;

type RenderPhase = 'request' | 'response' | 'error';

function renderToolPhase(
  phase: RenderPhase,
  {
    input,
    output,
    toolName,
  }: { input: unknown; output?: unknown; toolName: string }
) {
  const entry = toolRenderers[toolName];
  const renderer =
    phase === 'error'
      ? defaultTool.error
      : (entry?.[phase] ?? defaultTool[phase]);
  const rendered = renderer({ input, output, toolName });
  const title = rendered.title ?? entry?.title ?? toolName;
  if (phase === 'request') {
    return {
      details: clamp(rendered.details, REQUEST_DETAILS_MAX_LENGTH),
      title,
    };
  }
  return {
    output: clamp(
      phase === 'response'
        ? (resultErrorOutput(output) ?? rendered.output)
        : rendered.output
    ),
    title,
  };
}

export function renderToolCall(args: { input: unknown; toolName: string }) {
  return renderToolPhase('request', args);
}

export function renderToolResult(args: {
  input: unknown;
  output: unknown;
  toolName: string;
}) {
  return renderToolPhase('response', args);
}

export function renderToolError(args: {
  input: unknown;
  output: unknown;
  toolName: string;
}) {
  return renderToolPhase('error', args);
}
