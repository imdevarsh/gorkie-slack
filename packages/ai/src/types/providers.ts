export interface PiAttempt {
  backoffFactor?: number;
  customEnv: Record<string, string>;
  delayMs?: number;
  model: string;
  provider: string;
  retries: number;
}
