export const runtimeSessionStatuses = [
  'creating',
  'active',
  'pausing',
  'paused',
  'resuming',
  'destroying',
  'destroyed',
  'error',
] as const;

export type RuntimeSessionStatus = (typeof runtimeSessionStatuses)[number];

export interface ThreadSessionRecord {
  threadSessionKey: string;
  channelId: string;
  workspaceId: string;
  sandboxId: string;
  runtimeSessionId: string;
  previewUrl: string;
  previewAccessToken: string | null;
  status: RuntimeSessionStatus;
  lastError: string | null;
  resumeFailureCount: number;
}

export interface ThreadSessionInput {
  threadSessionKey: string;
  channelId: string;
  workspaceId: string;
  sandboxId: string;
  runtimeSessionId: string;
  previewUrl: string;
  previewAccessToken: string | null;
  status: RuntimeSessionStatus;
  lastError?: string | null;
}
