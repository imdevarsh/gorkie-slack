import { env } from "../env";

export interface ProviderEntry {
  apiKey: string;
  baseUrl: string;
}

const STATIC_BASE_URLS = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  hackclub: "https://ai.hackclub.com/proxy/v1",
  openrouter: "https://openrouter.ai/api/v1",
} as const;

export const providers: Record<string, ProviderEntry> = Object.fromEntries(
  Object.entries({
    gemini: {
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
      baseUrl: STATIC_BASE_URLS.gemini,
    },
    hackclub: {
      apiKey: env.HACKCLUB_API_KEY,
      baseUrl: STATIC_BASE_URLS.hackclub,
    },
    openrouter: {
      apiKey: env.OPENROUTER_API_KEY,
      baseUrl: env.OPENROUTER_BASE_URL ?? STATIC_BASE_URLS.openrouter,
    },
  }).filter((entry): entry is [string, ProviderEntry] =>
    Boolean(entry[1].apiKey && entry[1].baseUrl)
  )
);

export function listProviders(): string[] {
  return Object.keys(providers).sort();
}
