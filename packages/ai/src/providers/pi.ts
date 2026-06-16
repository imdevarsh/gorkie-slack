import { keys } from '../keys';
import { createPiAttempt, type PiAttempt } from './utils';

const env = keys();

// `prefix` picks which `<PREFIX>_API_KEY` / `<PREFIX>_BASE_URL` pair pi reads
// and which provider it registers. OPENROUTER gives an OpenRouter/OpenAI-style
// client (model ids like `openai/gpt-5.4-mini`); HackClub's proxy speaks that
// same protocol, so we just point OPENROUTER_BASE_URL at it. (Special prefixes
// — AI_GATEWAY/OPENAI/ANTHROPIC — would change pi's client behaviour.)
//
// Tried in order until one starts streaming. Each attempt retries its own model
// on a transient blip (e.g. HackClub 504); a non-retryable failure (e.g. out of
// credits) skips straight to the next provider.
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
