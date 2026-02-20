import { safeAppend } from '~/lib/ai/utils/stream';
import type { Stream, TaskChunk } from '~/types';

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

  chunks.push({
    type: 'task_update',
    id: taskId,
    title,
    status: 'in_progress',
    ...(details ? { details } : {}),
  });

  await safeAppend(stream, chunks);
  return taskId;
}

export async function finishTask(
  stream: Stream,
  taskId: string,
  status: 'complete' | 'error',
  output?: string
): Promise<void> {
  const title = stream.tasks.get(taskId);
  await safeAppend(stream, [
    {
      type: 'task_update',
      id: taskId,
      ...(title ? { title } : {}),
      status,
      ...(output ? { output } : {}),
    },
  ]);
}
