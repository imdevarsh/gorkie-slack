import type {
  AgentSessionEvent,
  RpcCommand,
  RpcResponse,
} from "@earendil-works/pi-coding-agent";

export type {
  AgentEvent,
  AgentMessage,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";
export type {
  AgentSessionEvent,
  CompactionResult,
  RpcCommand,
  RpcResponse,
  RpcSessionState,
} from "@earendil-works/pi-coding-agent";

type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;
export type RpcCommandBody = DistributiveOmit<RpcCommand, "id">;
export type RpcSlashCommand = Extract<
  RpcResponse,
  { command: "get_commands"; success: true }
>["data"]["commands"][number];

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
