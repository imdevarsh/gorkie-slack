export type ReasoningStreamPart =
  | { type: 'start-step' }
  | { text: string; type: 'reasoning-delta' }
  | {
      approvalId: string;
      toolCall: {
        input: unknown;
        toolCallId: string;
        toolMetadata?: {
          mcp?: {
            serverId?: string;
            serverName?: string;
            toolName?: string;
          };
        };
        toolName: string;
      };
      type: 'tool-approval-request';
    }
  | { type: string };

export interface ToolApprovalRequest {
  approvalId: string;
  exposedName: string;
  input: unknown;
  serverId: string;
  serverName: string;
  toolCallId: string;
  toolName: string;
}
