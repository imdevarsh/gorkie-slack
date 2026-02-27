import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { customProvider, wrapProvider } from 'ai';
import { createRetryable } from 'ai-retry';
import { env } from '~/env';
import logger from '~/lib/logger';

const hackclubBase = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: 'https://ai.hackclub.com/proxy/v1',
});

const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
});

const hackclub = wrapProvider({
  provider: hackclubBase,
  languageModelMiddleware: {
    specificationVersion: 'v3',
    // overrideModelId: ({ model }) => `override-${model.modelId}`,
    overrideProvider: () => 'hackclub',
  },
  imageModelMiddleware: {
    specificationVersion: 'v3',
    overrideProvider: () => 'hackclub',
  },
});

const onModelError = (context: {
  current: { model: { provider: string; modelId: string } };
}) => {
  const { model } = context.current;
  logger.error(
    `error with model ${model.provider}/${model.modelId}, switching to next model`
  );
};

const chatModel = createRetryable({
  model: hackclub.languageModel('google/gemini-3-flash-preview'),
  retries: [
    hackclub.languageModel('google/gemini-2.5-flash'),
    hackclub.languageModel('openai/gpt-5-mini'),
    openrouter('google/gemini-3-flash-preview'),
    openrouter('google/gemini-2.5-flash'),
    openrouter('openai/gpt-5-mini'),
  ],
  onError: onModelError,
});

const summariserModel = createRetryable({
  model: hackclub.languageModel('google/gemini-3-flash-preview'),
  retries: [
    hackclub.languageModel('google/gemini-2.5-flash'),
    hackclub.languageModel('openai/gpt-5-mini'),
    openrouter('google/gemini-2.5-flash-lite-preview-09-2025'),
    openrouter('openai/gpt-5-nano'),
  ],
  onError: onModelError,
});

export const provider = customProvider({
  languageModels: {
    'chat-model': chatModel,
    'summariser-model': summariserModel,
  },
  imageModels: {
    'image-model': hackclub.imageModel('google/gemini-3.1-flash-image-preview'),
  },
});
