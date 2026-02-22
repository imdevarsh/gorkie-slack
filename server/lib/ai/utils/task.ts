import { safeAppend } from '~/lib/ai/utils/stream';
import type { Stream, TaskChunk } from '~/types';

interface FinishTaskInput {
  taskId: string;
  status: 'complete' | 'error';
  output?: string;
  sources?: TaskChunk['sources'];
}

export async function updateTask(
  stream: Stream,
  {
    taskId,
    title,
    status,
    details,
    output,
    sources,
  }: {
    taskId: string;
    title?: string;
    status: TaskChunk['status'];
    details?: string;
    output?: string;
    sources?: TaskChunk['sources'];
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
      ? {
          output:
            status === 'error'
              ? `${output}\n**[Oops! An error occurred]**`
              : output,
        }
      : {}),
    ...(sources ? { sources } : {}),
  };

  stream.tasks.set(taskId, {
    title: chunk.title,
    status: chunk.status,
    details: chunk.details ?? previous?.details,
    output: chunk.output ?? previous?.output,
    sources: chunk.sources ?? previous?.sources,
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
  input: FinishTaskInput
): Promise<void> {
  await updateTask(stream, input);
}
