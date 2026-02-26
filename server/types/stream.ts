import type { Thread } from 'chat';

export interface TaskSource {
  text: string;
  type: 'url';
  url: string;
}

export interface TaskChunk {
  details?: string;
  id: string;
  output?: string;
  sources?: TaskSource[];
  status: 'in_progress' | 'complete' | 'error' | 'pending';
  title?: string;
  type: 'task_update';
}

export interface PlanChunk {
  title: string;
  type: 'plan_update';
}

export interface StreamTask {
  details?: string;
  output?: string;
  sources?: TaskSource[];
  status: TaskChunk['status'];
  title?: string;
}

export interface Stream {
  noop?: true;
  tasks: Map<string, StreamTask>;
  thought: boolean;
  thread: Thread;
}
