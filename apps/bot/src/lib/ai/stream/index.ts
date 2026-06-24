import type { TextStreamPart, ToolSet } from 'ai';
import type { StreamChunk } from 'chat';
import logger from '@/lib/logger';
import { clamp } from '@/lib/utils/text';
import { renderToolTask } from './tasks';

const MAX_VISIBLE_TASKS = 45;
const REASONING_OUTPUT_MAX_LENGTH = 2800;

export async function* renderStream({
  onTextDelta,
  stream,
}: {
  onTextDelta?: (text: string) => PromiseLike<void> | void;
  stream: AsyncIterable<TextStreamPart<ToolSet>>;
}): AsyncGenerator<string | StreamChunk> {
  const toolInputs = new Map<string, unknown>();
  const reasoning = new Map<string, string>();
  const visibleTaskIds = new Set<string>();
  let hiddenTaskCount = 0;
  for await (const part of stream) {
    switch (part.type) {
      case 'text-delta': {
        if (part.text) {
          await onTextDelta?.(part.text);
        }
        break;
      }
      case 'reasoning-start': {
        const id = reasoningTaskId(part.id);
        if (!showTask({ id, visibleTaskIds })) {
          hiddenTaskCount += 1;
          yield hiddenTaskUpdate({ count: hiddenTaskCount, done: false });
          break;
        }
        reasoning.set(id, '');
        yield {
          id,
          status: 'in_progress',
          title: 'Thinking',
          type: 'task_update',
        };
        break;
      }
      case 'reasoning-delta': {
        const id = reasoningTaskId(part.id);
        if (visibleTaskIds.has(id)) {
          reasoning.set(id, (reasoning.get(id) ?? '') + part.text);
        }
        break;
      }
      case 'reasoning-end': {
        const id = reasoningTaskId(part.id);
        if (!visibleTaskIds.has(id)) {
          break;
        }
        const text = reasoning.get(id)?.trim();
        yield {
          id,
          output: text ? clamp(text, REASONING_OUTPUT_MAX_LENGTH) : undefined,
          status: 'complete',
          title: 'Thinking',
          type: 'task_update',
        };
        reasoning.delete(id);
        break;
      }
      case 'tool-call': {
        toolInputs.set(part.toolCallId, part.input);
        logger.info(
          {
            input: part.input,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
          },
          '[tool] called'
        );
        const rendered = renderToolTask({
          input: part.input,
          phase: 'request',
          toolName: part.toolName,
        });
        if (!showTask({ id: part.toolCallId, visibleTaskIds })) {
          hiddenTaskCount += 1;
          yield hiddenTaskUpdate({ count: hiddenTaskCount, done: false });
          break;
        }
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
        const input = toolInputs.get(part.toolCallId);
        logger.info(
          {
            input,
            output: part.output,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
          },
          '[tool] completed'
        );
        const rendered = renderToolTask({
          input,
          output: part.output,
          phase: 'response',
          toolName: part.toolName,
        });
        toolInputs.delete(part.toolCallId);
        if (!visibleTaskIds.has(part.toolCallId)) {
          break;
        }
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
        const input = toolInputs.get(part.toolCallId);
        logger.warn(
          {
            error: part.error,
            input,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
          },
          '[tool] failed'
        );
        const rendered = renderToolTask({
          input,
          output: part.error,
          phase: 'error',
          toolName: part.toolName,
        });
        toolInputs.delete(part.toolCallId);
        if (!visibleTaskIds.has(part.toolCallId)) {
          break;
        }
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
  if (hiddenTaskCount > 0) {
    yield hiddenTaskUpdate({ count: hiddenTaskCount, done: true });
  }
}

function showTask({
  id,
  visibleTaskIds,
}: {
  id: string;
  visibleTaskIds: Set<string>;
}): boolean {
  if (visibleTaskIds.has(id)) {
    return true;
  }
  if (visibleTaskIds.size < MAX_VISIBLE_TASKS) {
    visibleTaskIds.add(id);
    return true;
  }
  return false;
}

function reasoningTaskId(id: string): string {
  return `reasoning-${id}`;
}

function hiddenTaskUpdate({
  count,
  done,
}: {
  count: number;
  done: boolean;
}): StreamChunk {
  return {
    id: 'hidden-activity',
    output: done
      ? `Ran ${count} additional activity item${count === 1 ? '' : 's'}.`
      : undefined,
    status: done ? 'complete' : 'in_progress',
    title: `Activity: ${count}`,
    type: 'task_update',
  };
}
