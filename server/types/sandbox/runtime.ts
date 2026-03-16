import type { Sandbox } from '@e2b/code-interpreter';
import type { PiRpcClient } from '~/lib/sandbox/rpc/client';
import type { SandboxTokens } from '~/lib/sandbox/tokens';

export interface ResolvedSandboxSession {
  client: PiRpcClient;
  sandbox: Sandbox;
  tokens: SandboxTokens;
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
