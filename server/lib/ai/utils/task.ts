import { safeAppend } from '~/lib/ai/utils/stream';
import type { RichTextBlock, Stream, TaskChunk } from '~/types';

function toRichText(text: string): RichTextBlock {
  return {
    type: 'rich_text',
    elements: [
      { type: 'rich_text_section', elements: [{ type: 'text', text }] },
    ],
  };
}

export async function createTask(
  stream: Stream,
  { title, details }: { title: string; details?: string }
): Promise<string> {
  const taskId = crypto.randomUUID();
  stream.tasks.set(taskId, title);
  const chunks: TaskChunk[] = [];
  if (!stream.understandComplete) {
    stream.understandComplete = true;
    chunks.push({
      type: 'task_update',
      id: '0-understand-task',
      title: 'Understanding the task...',
      status: 'complete',
    });
  }
  const chunk: TaskChunk = {
    type: 'task_update',
    id: taskId,
    title,
    status: 'in_progress',
  };
  if (details) {
    chunk.details = toRichText(details);
  }
  chunks.push(chunk);
  await safeAppend(stream, chunks);
  return taskId;
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
