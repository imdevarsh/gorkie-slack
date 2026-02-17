interface BaseHints {
  time: string;
  server: string;
  channel: string;
}

export interface ChatRequestHints extends BaseHints {
  joined: number;
  status: string;
  activity: string;
}

export interface SandboxRequestHints extends BaseHints {}

export type RequestHints = ChatRequestHints | SandboxRequestHints;
