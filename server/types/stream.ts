import type { WebClient } from '@slack/web-api';

export interface TaskChunk {
  type: 'task_update';
  id: string;
  title?: string;
  status: 'in_progress' | 'complete' | 'error' | 'pending';
  details?: string;
  output?: string;
}

export interface Stream {
  channel: string;
  ts: string;
  client: WebClient;
  tasks: Map<string, string>;
  thought: boolean;
  noop?: true;
}
