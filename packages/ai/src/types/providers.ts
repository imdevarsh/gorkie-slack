export interface PiAttempt {
  customEnv: Record<string, string>;
  model: string;
  provider: string;
  retries: number;
}
