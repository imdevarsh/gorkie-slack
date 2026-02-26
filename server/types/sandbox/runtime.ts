import type { Sandbox } from '@e2b/code-interpreter';
import type { PiRpcClient } from '~/lib/sandbox/rpc';

export interface ResolvedSandboxSession {
  client: PiRpcClient;
  sandbox: Sandbox;
}

export interface ShowFileInput {
  path: string;
  title?: string;
}

export interface PromptResourceLink {
  mimeType?: string;
  name: string;
  type: 'resource_link';
  uri: string;
}
