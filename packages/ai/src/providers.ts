import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { customProvider, type Provider } from 'ai';
import { keys } from './keys';

const env = keys();

export const HACKCLUB_BASE_URL = 'https://ai.hackclub.com/proxy/v1';
export const CHAT_MODEL_ID = 'openai/gpt-5.4-mini';

const hackclub = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: HACKCLUB_BASE_URL,
});

// AI SDK provider for host tools (e.g. generateImage). pi routes the chat model
// itself via the OPENROUTER_API_KEY / OPENROUTER_BASE_URL it reads from
// auth.customEnv, so it does not go through this provider.
export const provider: Provider = customProvider({
  languageModels: { 'chat-model': hackclub.languageModel(CHAT_MODEL_ID) },
  imageModels: {
    'image-model': hackclub.imageModel('google/gemini-3.1-flash-image-preview'),
  },
});
