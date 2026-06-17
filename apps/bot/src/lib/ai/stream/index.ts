import type { TextStreamPart, ToolSet } from 'ai';
import type { StreamChunk } from 'chat';
import { clamp } from '@/lib/utils/text';
import { renderToolCall, renderToolError, renderToolResult } from './tasks';

const REASONING_MAX = 2800;

export async function* renderStream(
  stream: AsyncIterable<TextStreamPart<ToolSet>>
): AsyncGenerator<string | StreamChunk> {
  const toolInputs = new Map<string, unknown>();
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
        toolInputs.set(part.toolCallId, part.input);
        const rendered = renderToolCall({
          input: part.input,
          toolName: part.toolName,
        });
        yield {
          details: rendered.details,
          id: part.toolCallId,
          status: 'in_progress',
          title: rendered.title,
          type: 'task_update',
        };
        break;
      }
      case 'tool-result': {
        const rendered = renderToolResult({
          input: toolInputs.get(part.toolCallId),
          output: part.output,
          toolName: part.toolName,
        });
        toolInputs.delete(part.toolCallId);
        yield {
          id: part.toolCallId,
          output: rendered.output,
          status: 'complete',
          title: rendered.title,
          type: 'task_update',
        };
        break;
      }
      case 'tool-error': {
        const rendered = renderToolError({
          input: toolInputs.get(part.toolCallId),
          output: part.error,
          toolName: part.toolName,
        });
        toolInputs.delete(part.toolCallId);
        yield {
          id: part.toolCallId,
          output: rendered.output,
          status: 'error',
          title: rendered.title,
          type: 'task_update',
        };
        break;
      }
      default:
        break;
    }
  }
}
