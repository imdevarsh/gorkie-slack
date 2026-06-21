import { clamp } from '@/lib/utils/text';
import { resultErrorOutput } from './helpers';
import { defaultTool, toolRenderers } from './renderers';

type RenderPhase = 'request' | 'response' | 'error';

export function renderToolTask({
  input,
  output,
  phase,
  toolName,
}: {
  input: unknown;
  output?: unknown;
  phase: RenderPhase;
  toolName: string;
}) {
  const entry = toolRenderers[toolName];
  const renderer =
    phase === 'error'
      ? defaultTool.error
      : (entry?.[phase] ?? defaultTool[phase]);
  const rendered = renderer({ input, output, toolName });
  const title = rendered.title ?? entry?.title ?? toolName;
  if (phase === 'request') {
    return {
      details: clamp(rendered.details, 180),
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
