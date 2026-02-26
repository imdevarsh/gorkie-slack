import type { TaskChunk } from '~/types/stream';

export interface FinishTaskInput {
  output?: string;
  sources?: TaskChunk['sources'];
  status: 'complete' | 'error';
  taskId: string;
}

export interface UpdateTaskInput {
  details?: string;
  output?: string;
  sources?: TaskChunk['sources'];
  status: TaskChunk['status'];
  taskId: string;
  title?: string;
}

export interface CreateTaskInput {
  details?: string;
  status?: Extract<TaskChunk['status'], 'pending' | 'in_progress'>;
  taskId: string;
  title: string;
}
