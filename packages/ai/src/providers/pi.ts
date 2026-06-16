import { keys } from '../keys';
import type { PiAttempt } from '../types/providers';

const env = keys();

// HackClub speaks OpenRouter protocol, so Pi must register an OPENROUTER client.
export const chatAttempts: PiAttempt[] = [
  {
    customEnv: {
      OPENROUTER_API_KEY: env.HACKCLUB_API_KEY,
      OPENROUTER_BASE_URL: 'https://ai.hackclub.com/proxy/v1',
    },
    model: 'google/gemini-3-flash-preview',
    provider: 'hackclub',
    retries: 2,
  },
  ...(env.OPENROUTER_API_KEY
    ? [
        {
          customEnv: {
            OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
            ...(env.OPENROUTER_BASE_URL
              ? { OPENROUTER_BASE_URL: env.OPENROUTER_BASE_URL }
              : {}),
          },
          model: 'google/gemini-3-flash-preview',
          provider: 'openrouter',
          retries: 2,
        },
      ]
    : []),
  ...(env.GEMINI_API_KEY
    ? [
        {
          customEnv: {},
          model: 'Gemini 3 Flash Preview',
          provider: 'google',
          retries: 2,
        },
      ]
    : []),
];
