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
  if (!stream.thought) {
    stream.thought = true;
    chunks.push({
      type: 'task_update',
      id: 'thinking',
      title: 'Thought',
      status: 'complete',
    });
  }

  const resolvedTitle = title ?? stream.tasks.get(taskId);
  const normalizedStatus = status === 'error' ? 'complete' : status;
  const normalizedOutput = status === 'error' && output ? `_${output}_` : output;

  chunks.push({
    type: 'task_update',
    id: taskId,
    ...(resolvedTitle ? { title: resolvedTitle } : {}),
    status: normalizedStatus,
    ...(details ? { details } : {}),
    ...(normalizedOutput ? { output: normalizedOutput } : {}),
  });

  await safeAppend(stream, chunks);
  return taskId;
}

export async function createTask(
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
  stream.tasks.set(taskId, title);
  await updateTask(stream, {
    taskId,
    title,
    details,
    status: status ?? 'pending',
  });
  return taskId;
}

export async function finishTask(
  stream: Stream,
  taskId: string,
  status: 'complete' | 'error',
  output?: string
): Promise<void> {
  await updateTask(stream, { taskId, status, output });
}
