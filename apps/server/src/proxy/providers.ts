import { env } from '../env';

export interface Provider {
  apiKey: string;
  baseUrl: string;
}

export const providers: Record<string, Provider> = Object.fromEntries(
  (
    [
      [
        'gemini',
        env.GOOGLE_GENERATIVE_AI_API_KEY,
        'https://generativelanguage.googleapis.com/v1beta/openai',
      ],
      ['hackclub', env.HACKCLUB_API_KEY, 'https://ai.hackclub.com/proxy/v1'],
      [
        'openrouter',
        env.OPENROUTER_API_KEY,
        env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
      ],
    ] as [string, string | undefined, string][]
  ).flatMap(([name, apiKey, baseUrl]) =>
    apiKey ? [[name, { apiKey, baseUrl }]] : []
  )
);

export function listProviders(): string[] {
  return Object.keys(providers).sort();
}
