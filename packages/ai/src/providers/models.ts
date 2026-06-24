import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { customProvider, type Provider } from 'ai';
import { keys } from '../keys';

const env = keys();

const hostProvider = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: 'https://ai.hackclub.com/proxy/v1',
});

export const provider: Provider = customProvider({
  languageModels: {
    'chat-model': hostProvider.languageModel('google/gemini-3-flash-preview'),
  },
  imageModels: {
    'image-model': hostProvider.imageModel('google/gemini-3.1-flash-image'),
  },
});
