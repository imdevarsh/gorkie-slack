import type { TextStreamPart, ToolSet } from 'ai';
import type { StreamChunk } from 'chat';

// Maps pi's harness stream into Chat SDK chunks so Slack shows live progress:
// text streams as the reply, and each tool call renders as a task card
// (Running command, Reading file, …) — the v1 "thinking/working" UI.

const TASK_TITLES: Record<string, string> = {
  bash: 'Running command',
  edit: 'Editing file',
  glob: 'Finding files',
  grep: 'Searching',
  ls: 'Listing files',
  read: 'Reading file',
  write: 'Writing file',
};

const DETAIL_MAX = 180;
const OUTPUT_MAX = 280;

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function field(input: unknown, key: string): string | undefined {
  if (input && typeof input === 'object' && key in input) {
    const value = (input as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function taskDetails(toolName: string, input: unknown): string | undefined {
  const detail =
    field(input, 'command') ??
    field(input, 'file_path') ??
    field(input, 'pattern') ??
    field(input, 'path');
  return detail ? clamp(`${toolName}: ${detail}`, DETAIL_MAX) : undefined;
}

function resultOutput(output: unknown): string | undefined {
  const text =
    typeof output === 'string' ? output : (field(output, 'text') ?? '');
  return text ? clamp(text, OUTPUT_MAX) : undefined;
}

export async function* renderHarnessStream(
  stream: AsyncIterable<TextStreamPart<ToolSet>>
): AsyncGenerator<StreamChunk> {
  for await (const part of stream) {
    if (part.type === 'text-delta') {
      yield { type: 'markdown_text', text: part.text };
    } else if (part.type === 'tool-call') {
      yield {
        type: 'task_update',
        id: part.toolCallId,
        title: TASK_TITLES[part.toolName] ?? part.toolName,
        status: 'in_progress',
        details: taskDetails(part.toolName, part.input),
      };
    } else if (part.type === 'tool-result') {
      yield {
        type: 'task_update',
        id: part.toolCallId,
        title: TASK_TITLES[part.toolName] ?? part.toolName,
        status: 'complete',
        output: resultOutput(part.output),
      };
    } else if (part.type === 'tool-error') {
      yield {
        type: 'task_update',
        id: part.toolCallId,
        title: TASK_TITLES[part.toolName] ?? part.toolName,
        status: 'error',
        output: resultOutput(part.error),
      };
    }
  }
}
