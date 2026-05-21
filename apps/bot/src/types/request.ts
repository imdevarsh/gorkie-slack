import type { UserCustomization } from "@repo/db/queries/customizations";

interface BaseHints {
  channel: string;
  server: string;
  time: string;
}

export interface ChatRequestHints extends BaseHints {
  activity: string;
  customization?: UserCustomization;
  joined: number;
  status: string;
}

export interface SandboxRequestHints extends BaseHints {}
