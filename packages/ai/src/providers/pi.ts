import { keys } from '../keys';
import { createPiAttempt, type PiAttempt } from './utils';

const env = keys();

// HackClub speaks OpenRouter protocol, so Pi must register an OPENROUTER client.
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
];
