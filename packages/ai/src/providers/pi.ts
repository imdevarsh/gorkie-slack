import { keys } from '../keys';
import type { PiAttempt } from '../types/providers';

const env = keys();

export const chatAttempts: PiAttempt[] = [
  {
    customEnv: {
      OPENROUTER_API_KEY: env.HACKCLUB_API_KEY,
      OPENROUTER_BASE_URL: 'https://ai.hackclub.com/proxy/v1',
    },
    // either minimax/minimax-m3 or moonshotai/kimi-k2.7-code are good...
    model: 'minimax/minimax-m3',
    provider: 'hackclub',
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
          model: 'minimax/minimax-m3',
          provider: 'openrouter',
        },
      ]
    : []),
  ...(env.OPENCODE_API_KEY
    ? [
        {
          customEnv: {
            OPENCODE_API_KEY: env.OPENCODE_API_KEY,
          },
          // either minimax-m3 or kimi-k2.7-code are good...
          model: 'qwen3.7-max',
          provider: 'opencode-go',
        },
      ]
    : []),
  ...(env.INFERENCE_API_KEY
    ? [
        {
          customEnv: {
            OPENROUTER_API_KEY: env.INFERENCE_API_KEY,
            OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
          },
          model: 'moonshotai/kimi-k2.6',
          provider: 'inference',
        },
      ]
    : []),
];

if (chatAttempts.length === 0) {
  throw new Error('No Pi model attempts configured.');
}
