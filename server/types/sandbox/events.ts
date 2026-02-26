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
