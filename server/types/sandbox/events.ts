import type { PiRpcClient } from '~/lib/sandbox/rpc/client';
import type { ResolvedSandboxSession, SlackMessageContext } from '~/types';
import type { AgentSessionEvent } from '~/types/sandbox/rpc';

export interface ToolStartEvent {
  args: unknown;
  status?: string;
  toolCallId: string;
  toolName: string;
}

export interface ToolEndEvent {
  isError: boolean;
  result: unknown;
  toolCallId: string;
  toolName: string;
}

export interface RetryEvent {
  attempt: number;
  delayMs: number;
  errorMessage: string;
  maxAttempts: number;
}

export interface SubscribeEventsParams {
  client: PiRpcClient;
  context: SlackMessageContext;
  ctxId: string;
  events: AgentSessionEvent[];
  onRetry?: (event: RetryEvent) => void | Promise<void>;
  onToolEnd?: (event: ToolEndEvent) => void | Promise<void>;
  onToolStart?: (event: ToolStartEvent) => void | Promise<void>;
  runtime: ResolvedSandboxSession;
}
