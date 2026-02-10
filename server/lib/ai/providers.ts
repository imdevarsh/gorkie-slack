import { openai } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { customProvider, wrapLanguageModel } from 'ai';
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

const hackclub = (modelId: string) =>
  wrapLanguageModel({
    model: hackclubBase(modelId),
    // middleware is required even though it's unnecessary
    middleware: {
      specificationVersion: 'v3',
    },
    modelId,
    providerId: 'hackclub',
  });

const chatModel = createRetryable({
  model: openai('gpt-5-mini'),
  retries: [
    hackclub('google/gemini-2.5-flash'),
    hackclub('openai/gpt-5-mini'),
    openrouter('google/gemini-3-flash-preview'),
    openrouter('google/gemini-2.5-flash'),
    openrouter('openai/gpt-5-mini'),
  ],
  onError: (context) => {
    const { model } = context.current;
    logger.error(
      `error with model ${model.provider}/${model.modelId}, switching to next model`
    );
  },
});

const summariserModel = createRetryable({
  model: openai('gpt-5-nano'),
  retries: [
    hackclub('google/gemini-3-flash-preview'),
    hackclub('google/gemini-2.5-flash'),
    hackclub('openai/gpt-5-mini'),
    openrouter('google/gemini-2.5-flash-lite-preview-09-2025'),
    openrouter('openai/gpt-5-nano'),
  ],
  onError: (context) => {
    const { model } = context.current;
    logger.error(
      `error with model ${model.provider}/${model.modelId}, switching to next model`
    );
  },
});

const codeModel = createRetryable({
  model: openai('gpt-5'),
  retries: [
    hackclub('openai/gpt-5'),
    openrouter('openai/gpt-5'),
    hackclub('openai/gpt-5-mini'),
    openrouter('openai/gpt-5-mini'),
    openrouter('google/gemini-2.5-pro'),
  ],
  onError: (context) => {
    const { model } = context.current;
    logger.error(
      `error with model ${model.provider}/${model.modelId}, switching to next model`
    );
  },
});

export const provider = customProvider({
  languageModels: {
    'chat-model': chatModel,
    'summariser-model': summariserModel,
    'relevance-model': summariserModel,
    'code-model': codeModel,
  },
});
