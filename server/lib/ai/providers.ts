import { createOpenAI } from '@ai-sdk/openai';
import { customProvider } from 'ai';
import { env } from '~/env';

const openai = createOpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export const provider = customProvider({
  languageModels: {
    'chat-model': openai('gpt-5-mini'),
    'summariser-model': openai('gpt-5-nano'),
  },
  imageModels: {
    'image-model': openai.image('gpt-image-1'),
  },
});
