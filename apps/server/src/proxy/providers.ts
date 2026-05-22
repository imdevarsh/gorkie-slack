import { env } from '../env.js';

export interface ProviderEntry {
  apiKey: string;
  baseUrl: string;
}

interface ProviderConfig {
  apiKey: string | undefined;
  baseUrl: string;
}

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  gemini: {
    apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  hackclub: {
    apiKey: env.HACKCLUB_API_KEY,
    baseUrl: 'https://ai.hackclub.com/proxy/v1',
  },
  openrouter: {
    apiKey: env.OPENROUTER_API_KEY,
    baseUrl: env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  },
};

export const providers: Record<string, ProviderEntry> = Object.fromEntries(
  Object.entries(PROVIDER_CONFIGS).flatMap(([name, { apiKey, baseUrl }]) =>
    apiKey ? [[name, { apiKey, baseUrl }]] : []
  )
);

export function listProviders(): string[] {
  return Object.keys(providers).sort();
}
