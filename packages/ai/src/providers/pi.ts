import { keys } from '../keys';
import type { PiAttempt } from '../types/providers';

const env = keys();

export const chatAttempts: PiAttempt[] = [
  ...(env.OPENCODE_API_KEY
    ? [
        {
          // opencode-go is a native Pi provider; Pi reads OPENCODE_API_KEY from
          // the process env and applies its auth (no generic _BASE_URL, which
          // forces the wrong Bearer auth -> 401). Pi picks the provider from the
          // model id (first catalog match), so the model must be one only
          // opencode-go owns: qwen3.7-max is opencode-go-exclusive in pi-ai
          // 0.77.0. Kimi (k2.5/k2.6) resolves to moonshotai first and can't be
          // forced here; kimi-k2.7-code needs a newer pi-ai.
          customEnv: {
            OPENCODE_API_KEY: env.OPENCODE_API_KEY,
          },
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
