import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { customProvider, type Provider } from 'ai';
import { keys } from './keys';

const env = keys();

export interface PiAttempt {
  customEnv: Record<string, string>;
  model: string;
  provider: string;
  retries: number;
}

function createPiAttempt({
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

const hostProvider = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: 'https://ai.hackclub.com/proxy/v1',
});

export const chatAttempts: PiAttempt[] = [
  createPiAttempt({
    apiKey: env.HACKCLUB_API_KEY,
    baseUrl: 'https://ai.hackclub.com/proxy/v1',
    model: 'openai/gpt-5.4-mini',
    prefix: 'OPENROUTER',
    provider: 'hackclub',
    retries: 2,
  }),
  ...(env.OPENROUTER_API_KEY
    ? [
        createPiAttempt({
          apiKey: env.OPENROUTER_API_KEY,
          baseUrl: env.OPENROUTER_BASE_URL,
          model: 'openai/gpt-5.4-mini',
          prefix: 'OPENROUTER',
          provider: 'openrouter',
          retries: 2,
        }),
      ]
    : []),
  // Gemini free-tier quota is too low for fallback traffic right now.
  // ...(env.GOOGLE_GENERATIVE_AI_API_KEY
  //   ? [
  //       {
  //         customEnv: {},
  //         model: 'Gemini 3 Flash Preview',
  //         provider: 'google',
  //         retries: 2,
  //       },
  //     ]
  //   : []),
];

export const provider: Provider = customProvider({
  languageModels: {
    'chat-model': hostProvider.languageModel('openai/gpt-5.4-mini'),
  },
  imageModels: {
    'image-model': hostProvider.imageModel(
      'google/gemini-3.1-flash-image-preview'
    ),
  },
});
