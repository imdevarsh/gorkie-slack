import type { TextStreamPart, ToolSet } from 'ai';
import type { StreamChunk } from 'chat';

// Bridges pi's harness stream to Chat SDK: text-delta passes through as plain
// strings (Chat SDK's proven text path), and each tool call renders as a task
// card (Running command, Reading file, …) — the v1 "thinking/working" UI.

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
  return;
}

function taskTitle(toolName: string): string {
  return TASK_TITLES[toolName] ?? toolName;
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
): AsyncGenerator<string | StreamChunk> {
  for await (const part of stream) {
    switch (part.type) {
      case 'text-delta': {
        if (part.text) {
          yield part.text;
        }
        break;
      }
      case 'tool-call': {
        yield {
          details: taskDetails(part.toolName, part.input),
          id: part.toolCallId,
          status: 'in_progress',
          title: taskTitle(part.toolName),
          type: 'task_update',
        };
        break;
      }
      case 'tool-result': {
        yield {
          id: part.toolCallId,
          output: resultOutput(part.output),
          status: 'complete',
          title: taskTitle(part.toolName),
          type: 'task_update',
        };
        break;
      }
      case 'tool-error': {
        yield {
          id: part.toolCallId,
          output: resultOutput(part.error),
          status: 'error',
          title: taskTitle(part.toolName),
          type: 'task_update',
        };
        break;
      }
      default:
        break;
    }
  }
}
