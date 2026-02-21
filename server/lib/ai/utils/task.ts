import { safeAppend } from '~/lib/ai/utils/stream';
import type { Stream, TaskChunk } from '~/types';

export async function createTask(
  stream: Stream,
  { title, details }: { title: string; details?: string }
): Promise<string> {
  const taskId = crypto.randomUUID();
  stream.tasks.set(taskId, title);
  const chunks: TaskChunk[] = [];

  if (!stream.thought) {
    stream.thought = true;
    chunks.push({
      type: 'task_update',
      id: 'thinking',
      title: 'Thought',
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
  const formattedOutput =
    status === 'error' && output ? `_${output}_` : output;

  await safeAppend(stream, [
    {
      type: 'task_update',
      id: taskId,
      ...(title ? { title } : {}),
      status: status !== 'error' ? status : 'complete',
      ...(formattedOutput ? { output: formattedOutput } : {}),
    },
  ]);
}
