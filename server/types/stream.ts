import type { WebClient } from '@slack/web-api';

export interface RichTextSection {
  type: 'rich_text_section';
  elements: Array<{ type: 'text'; text: string }>;
}

export interface RichTextBlock {
  type: 'rich_text';
  elements: RichTextSection[];
}

export interface TaskChunk {
  type: 'task_update';
  id: string;
  title?: string;
  status: 'in_progress' | 'complete' | 'error' | 'pending';
  details?: RichTextBlock;
  output?: RichTextBlock;
}

export interface Stream {
  channel: string;
  ts: string;
  client: WebClient;
  tasks: Map<string, string>;
  understandComplete: boolean;
  noop?: true;
}
