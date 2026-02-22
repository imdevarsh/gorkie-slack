import type { AgentEvent, ThinkingLevel } from '@mariozechner/pi-agent-core';

export type {
  AgentEvent,
  AgentMessage,
  ThinkingLevel,
} from '@mariozechner/pi-agent-core';
export type { CompactionResult } from '@mariozechner/pi-coding-agent';

export interface RpcSessionState {
  model?: { provider: string; id: string };
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: 'all' | 'one-at-a-time';
  followUpMode: 'all' | 'one-at-a-time';
  sessionFile?: string;
  sessionId: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
}

export type RpcCommand =
  | { id?: string; type: 'prompt'; message: string }
  | { id?: string; type: 'steer'; message: string }
  | { id?: string; type: 'follow_up'; message: string }
  | { id?: string; type: 'abort' }
  | { id?: string; type: 'new_session'; parentSession?: string }
  | { id?: string; type: 'get_state' }
  | { id?: string; type: 'set_model'; provider: string; modelId: string }
  | { id?: string; type: 'set_thinking_level'; level: ThinkingLevel }
  | { id?: string; type: 'set_steering_mode'; mode: 'all' | 'one-at-a-time' }
  | { id?: string; type: 'set_follow_up_mode'; mode: 'all' | 'one-at-a-time' }
  | { id?: string; type: 'compact'; customInstructions?: string }
  | { id?: string; type: 'set_auto_compaction'; enabled: boolean }
  | { id?: string; type: 'set_auto_retry'; enabled: boolean }
  | { id?: string; type: 'abort_retry' }
  | { id?: string; type: 'bash'; command: string }
  | { id?: string; type: 'abort_bash' }
  | { id?: string; type: 'switch_session'; sessionPath: string }
  | { id?: string; type: 'get_last_assistant_text' }
  | { id?: string; type: 'set_session_name'; name: string }
  | { id?: string; type: 'get_messages' };

export type RpcResponse =
  | {
      id?: string;
      type: 'response';
      command: string;
      success: true;
      data?: unknown;
    }
  | {
      id?: string;
      type: 'response';
      command: string;
      success: false;
      error: string;
    };

type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;
export type RpcCommandBody = DistributiveOmit<RpcCommand, 'id'>;

export type RpcEventListener = (event: AgentEvent) => void;

export interface PendingRequest {
  resolve: (response: RpcResponse) => void;
  reject: (error: Error) => void;
}
