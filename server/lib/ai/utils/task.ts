import { safeAppend } from '~/lib/ai/utils/stream';
import type { RichTextBlock, Stream, TaskChunk } from '~/types';

const IS_PREFIX_RE = /^is\s+/i;

function normalizeTitle(title: string): string {
  const stripped = title.replace(IS_PREFIX_RE, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function toRichText(text: string): RichTextBlock {
  return {
    type: 'rich_text',
    elements: [
      { type: 'rich_text_section', elements: [{ type: 'text', text }] },
    ],
  };
}

export async function completeUnderstandTask(stream: Stream): Promise<void> {
  await safeAppend(stream, [
    {
      type: 'task_update',
      id: '0-understand-task',
      title: 'Understanding the task...',
      status: 'complete',
    },
  ]);
}

export async function createTask(
  stream: Stream,
  { title, details }: { title: string; details?: string }
): Promise<string> {
  const task = crypto.randomUUID();
  const normalized = normalizeTitle(title);
  stream.tasks.set(task, normalized);
  const chunk: TaskChunk = {
    type: 'task_update',
    id: task,
    title: normalized,
    status: 'in_progress',
  };
  if (details) {
    chunk.details = toRichText(details);
  }
  await safeAppend(stream, [chunk]);
  return task;
}

export async function finishTask(
  stream: Stream,
  task: string,
  status: 'complete' | 'error',
  output?: string
): Promise<void> {
  const title = stream.tasks.get(task);
  const chunk: TaskChunk = { type: 'task_update', id: task, title, status };
  if (output) {
    chunk.output = toRichText(output);
  }
  await safeAppend(stream, [chunk]);
}
