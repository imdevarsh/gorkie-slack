import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type {
  RpcCommand,
  RpcResponse,
} from "@earendil-works/pi-coding-agent/rpc";

export type {
  AgentSessionEvent,
  CompactionResult,
} from "@earendil-works/pi-coding-agent";
export type {
  RpcCommand,
  RpcResponse,
  RpcSessionState,
  RpcSlashCommand,
} from "@earendil-works/pi-coding-agent/rpc";
export type {
  AgentEvent,
  AgentMessage,
  ThinkingLevel,
} from "@mariozechner/pi-agent-core";

type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;
export type RpcCommandBody = DistributiveOmit<RpcCommand, "id">;

export type RpcEventListener = (event: AgentSessionEvent) => void;

export interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (response: RpcResponse) => void;
}

export interface PtyLike {
  disconnect: () => Promise<void>;
  kill: () => Promise<unknown>;
  sendInput: (data: string) => Promise<void>;
}
