import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';
import type {
  RpcCommand,
  RpcResponse,
} from '@mariozechner/pi-coding-agent/rpc';

export type {
  AgentEvent,
  AgentMessage,
  ThinkingLevel,
} from '@mariozechner/pi-agent-core';
export type {
  AgentSessionEvent,
  CompactionResult,
} from '@mariozechner/pi-coding-agent';
export type {
  RpcCommand,
  RpcResponse,
  RpcSessionState,
} from '@mariozechner/pi-coding-agent/rpc';

type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;
export type RpcCommandBody = DistributiveOmit<RpcCommand, 'id'>;

export type RpcEventListener = (event: AgentSessionEvent) => void;

export interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (response: RpcResponse) => void;
}
