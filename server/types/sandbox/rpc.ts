import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type {
  RpcCommand,
  RpcResponse,
} from '@mariozechner/pi-coding-agent/rpc';

export type {
  AgentEvent,
  AgentMessage,
  ThinkingLevel,
} from '@mariozechner/pi-agent-core';
export type { CompactionResult } from '@mariozechner/pi-coding-agent';
export type {
  RpcCommand,
  RpcResponse,
  RpcSessionState,
  RpcSlashCommand,
} from '@mariozechner/pi-coding-agent/rpc';

type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;
export type RpcCommandBody = DistributiveOmit<RpcCommand, 'id'>;

export type RpcEventListener = (event: AgentEvent) => void;

export interface PendingRequest {
  resolve: (response: RpcResponse) => void;
  reject: (error: Error) => void;
}
