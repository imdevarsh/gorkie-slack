import type { TextStreamPart, ToolSet } from 'ai';
import type { StreamChunk } from 'chat';
import { clamp } from '@/lib/utils/text';
import { toolTitle } from './tools';

const DETAIL_MAX = 180;
const OUTPUT_MAX = 280;
const REASONING_MAX = 2800;

function field(input: unknown, key: string): string | undefined {
  if (input && typeof input === 'object' && key in input) {
    const value = (input as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
  }
  return;
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

export async function* renderStream(
  stream: AsyncIterable<TextStreamPart<ToolSet>>
): AsyncGenerator<string | StreamChunk> {
  const reasoning = new Map<string, string>();
  for await (const part of stream) {
    switch (part.type) {
      case 'text-delta': {
        if (part.text) {
          yield part.text;
        }
        break;
      }
      case 'reasoning-start': {
        reasoning.set(part.id, '');
        yield {
          id: `reasoning-${part.id}`,
          status: 'in_progress',
          title: 'Thinking',
          type: 'task_update',
        };
        break;
      }
      case 'reasoning-delta': {
        reasoning.set(part.id, (reasoning.get(part.id) ?? '') + part.text);
        break;
      }
      case 'reasoning-end': {
        const text = reasoning.get(part.id)?.trim();
        yield {
          id: `reasoning-${part.id}`,
          output: text ? clamp(text, REASONING_MAX) : undefined,
          status: 'complete',
          title: 'Thinking',
          type: 'task_update',
        };
        reasoning.delete(part.id);
        break;
      }
      case 'tool-call': {
        yield {
          details: taskDetails(part.toolName, part.input),
          id: part.toolCallId,
          status: 'in_progress',
          title: toolTitle(part.toolName),
          type: 'task_update',
        };
        break;
      }
      case 'tool-result': {
        yield {
          id: part.toolCallId,
          output: resultOutput(part.output),
          status: 'complete',
          title: toolTitle(part.toolName),
          type: 'task_update',
        };
        break;
      }
      case 'tool-error': {
        yield {
          id: part.toolCallId,
          output: resultOutput(part.error),
          status: 'error',
          title: toolTitle(part.toolName),
          type: 'task_update',
        };
        break;
      }
      default:
        break;
    }
  }
}
