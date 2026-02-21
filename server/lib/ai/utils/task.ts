import { safeAppend } from '~/lib/ai/utils/stream';
import type { Stream, TaskChunk } from '~/types';

export async function updateTask(
  stream: Stream,
  {
    taskId,
    title,
    status,
    details,
    output,
  }: {
    taskId: string;
    title?: string;
    status: TaskChunk['status'];
    details?: string;
    output?: string;
  }
): Promise<string> {
  const chunks: TaskChunk[] = [];

  const previous = stream.tasks.get(taskId);

  const chunk: TaskChunk = {
    type: 'task_update',
    id: taskId,
    status: status === 'error' ? 'complete' : status,
    ...((title ?? previous?.title) ? { title: title ?? previous?.title } : {}),
    ...(details ? { details } : {}),
    ...(output
      ? { output: status === 'error' ? `**[Oops! An error occurred]**\n ${output}` : output }
      : {}),
  };

  stream.tasks.set(taskId, {
    title: chunk.title,
    status: chunk.status,
    details: chunk.details ?? previous?.details,
    output: chunk.output ?? previous?.output,
  });

  chunks.push(chunk);

  await safeAppend(stream, chunks);
  return taskId;
}

export function createTask(
  stream: Stream,
  {
    taskId,
    title,
    details,
    status,
  }: {
    taskId: string;
    title: string;
    details?: string;
    status?: Extract<TaskChunk['status'], 'pending' | 'in_progress'>;
  }
): Promise<string> {
  return updateTask(stream, {
    taskId,
    title,
    details,
    status: status ?? 'pending',
  });
}

export async function finishTask(
  stream: Stream,
  taskId: string,
  status: 'complete' | 'error',
  output?: string
): Promise<void> {
  await updateTask(stream, { taskId, status, output });
}
