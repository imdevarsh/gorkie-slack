import type { TextStreamPart, ToolSet } from 'ai';
import type { StreamChunk } from 'chat';

// Bridges pi's harness stream to Chat SDK: text-delta passes through as plain
// strings (Chat SDK's proven text path), and each tool call renders as a task
// card (Running command, Reading file, …) — the v1 "thinking/working" UI.

const TASK_TITLES: Record<string, string> = {
  // pi sandbox builtins
  bash: 'Running command',
  edit: 'Editing file',
  glob: 'Finding files',
  grep: 'Searching',
  ls: 'Listing files',
  read: 'Reading file',
  write: 'Writing file',
  // host tools
  addReaction: 'Adding reaction',
  compaction: 'Compacting context',
  fetchMessages: 'Reading messages',
  fetchThread: 'Reading thread',
  fileChange: 'Updating file',
  generateImage: 'Generating image',
  getChannelInfo: 'Reading channel',
  getUser: 'Looking up user',
  postChannelMessage: 'Posting to channel',
  postMessage: 'Sending message',
  removeReaction: 'Removing reaction',
  searchWeb: 'Searching the web',
  sendDirectMessage: 'Sending DM',
  startTyping: 'Typing',
  uploadFile: 'Uploading file',
};

const DETAIL_MAX = 180;
const OUTPUT_MAX = 280;
// Reasoning is the point of the "Thinking" card, so give it room (Slack section
// text caps at 3000 chars).
const REASONING_MAX = 2800;

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
  stream: AsyncIterable<TextStreamPart<ToolSet>>,
  options: { initialReasoningTaskId?: string } = {}
): AsyncGenerator<string | StreamChunk> {
  const reasoning = new Map<string, string>();
  const reasoningTaskIds = new Map<string, string>();
  let usedInitialReasoningTask = false;
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
        const taskId =
          options.initialReasoningTaskId && !usedInitialReasoningTask
            ? options.initialReasoningTaskId
            : `reasoning-${part.id}`;
        reasoningTaskIds.set(part.id, taskId);
        usedInitialReasoningTask = true;
        yield {
          id: taskId,
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
          id: reasoningTaskIds.get(part.id) ?? `reasoning-${part.id}`,
          output: text ? clamp(text, REASONING_MAX) : undefined,
          status: 'complete',
          title: 'Thinking',
          type: 'task_update',
        };
        reasoning.delete(part.id);
        reasoningTaskIds.delete(part.id);
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
  if (options.initialReasoningTaskId && !usedInitialReasoningTask) {
    yield {
      id: options.initialReasoningTaskId,
      status: 'complete',
      title: 'Thinking',
      type: 'task_update',
    };
  }
}
