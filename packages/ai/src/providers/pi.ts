import { keys } from '../keys';
import type { PiAttempt } from '../types/providers';

const env = keys();

export const chatAttempts: PiAttempt[] = [
  ...(env.OPENCODE_API_KEY
    ? [
      {
        customEnv: {
          OPENROUTER_API_KEY: env.OPENCODE_API_KEY,
          OPENROUTER_BASE_URL: 'https://opencode.ai/zen/go/v1',
        },
        model: 'kimi-k2.7-code',
        provider: 'opencode-go',
      },
    ]
    : []),
  // {
  //   customEnv: {
  //     OPENROUTER_API_KEY: env.HACKCLUB_API_KEY,
  //     OPENROUTER_BASE_URL: 'https://ai.hackclub.com/proxy/v1',
  //   },
  //   model: 'google/gemini-3-flash-preview',
  //   provider: 'hackclub',
  // },
  // ...(env.OPENROUTER_API_KEY
  //   ? [
  //       {
  //         customEnv: {
  //           OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
  //           ...(env.OPENROUTER_BASE_URL
  //             ? { OPENROUTER_BASE_URL: env.OPENROUTER_BASE_URL }
  //             : {}),
  //         },
  //         model: 'google/gemini-3-flash-preview',
  //         provider: 'openrouter',
  //       },
  //     ]
  //   : []),
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
  // ...(env.CEREBRAS_API_KEY
  //   ? [
  //       {
  //         customEnv: {
  //           CEREBRAS_API_KEY: env.CEREBRAS_API_KEY,
  //           CEREBRAS_BASE_URL: 'https://api.cerebras.ai/v1',
  //         },
  //         model: 'zai-glm-4.7',
  //         provider: 'cerebras',
  //       },
  //     ]
  //   : []),
];

if (chatAttempts.length === 0) {
  throw new Error('No Pi model attempts configured.');
}
