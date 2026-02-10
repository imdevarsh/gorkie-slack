import type { SlackFile } from '~/utils/images';

export interface SandboxAttachments {
  files: SlackFile[];
  messageTs: string;
}
