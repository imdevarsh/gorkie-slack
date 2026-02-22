interface BaseHints {
  channel: string;
  server: string;
  time: string;
}

export interface ChatRequestHints extends BaseHints {
  activity: string;
  joined: number;
  status: string;
}

export interface SandboxRequestHints extends BaseHints {}

export type RequestHints = ChatRequestHints | SandboxRequestHints;
