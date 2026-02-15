import { sandbox as config } from '~/config';

export const CONFIG_PATH = `${config.runtime.workdir}/opencode.json`;

export function buildConfig(prompt: string): string {
  return JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
      model: 'openrouter/google/gemini-3-flash-preview',
      share: 'disabled',
      permission: 'allow',
      provider: {
        openrouter: {
          options: {
            baseURL: 'https://ai.hackclub.com/proxy/v1',
            apiKey: '{env:HACKCLUB_API_KEY}',
          },
          models: {
            'openai/gpt-5-mini': {},
            'google/gemini-3-flash-preview': {},
          },
        },
      },
      agent: {
        gorkie: {
          mode: 'primary',
          prompt,
        },
      },
    },
    null,
    2
  );
}
