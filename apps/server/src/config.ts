export type { Provider } from '@/types';

import type { ProviderConfig } from '@/types';
import { env } from './env';

const CONFIGS: ProviderConfig[] = [
  {
    name: 'gemini',
    apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    url: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  {
    name: 'hackclub',
    apiKey: env.HACKCLUB_API_KEY,
    url: 'https://ai.hackclub.com/proxy/v1',
  },
  {
    name: 'openrouter',
    apiKey: env.OPENROUTER_API_KEY,
    url: env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  },
];

export const providers = Object.fromEntries(
  CONFIGS.flatMap(({ name, apiKey, url }) =>
    apiKey ? [[name, { apiKey, url }]] : []
  )
);
