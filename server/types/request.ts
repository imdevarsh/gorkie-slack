import type { SandboxFile } from '~/lib/ai/tools/execute-code';

export interface RequestHints {
  time: string;
  server: string;
  channel: string;
  joined: number;
  status: string;
  activity: string;
  attachments: SandboxFile[];
}
