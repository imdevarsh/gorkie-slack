export interface PiAttempt {
  customEnv: Record<string, string>;
  model: string;
  provider: string;
  retries: number;
}

export function createPiAttempt({
  apiKey,
  baseUrl,
  model,
  prefix,
  provider,
  retries = 1,
}: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prefix: string;
  provider: string;
  retries?: number;
}): PiAttempt {
  return {
    customEnv: {
      [`${prefix}_API_KEY`]: apiKey,
      ...(baseUrl ? { [`${prefix}_BASE_URL`]: baseUrl } : {}),
    },
    model,
    provider,
    retries,
  };
}
