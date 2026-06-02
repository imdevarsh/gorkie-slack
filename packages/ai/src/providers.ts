import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createLogger } from '@repo/logging/logger';
import { APICallError, customProvider, type Provider, wrapProvider } from 'ai';
import { createRetryable, type LanguageModel, type Retry } from 'ai-retry';
import { requestNotRetryable } from 'ai-retry/retryables';

import { keys } from './keys';

const logger = await createLogger({ fileLogging: false });

const env = keys();

const RETRY = {
  backoffFactor: 2,
  delay: 250,
  maxAttempts: 2,
} satisfies Omit<Retry<LanguageModel>, 'model'>;

const hackclubBase = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: 'https://ai.hackclub.com/proxy/v1',
});

const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL ?? undefined,
});

const hackclub = wrapProvider({
  provider: hackclubBase,
  languageModelMiddleware: {
    specificationVersion: 'v3',
    overrideProvider: () => 'hackclub',
  },
  imageModelMiddleware: {
    specificationVersion: 'v3',
    overrideProvider: () => 'hackclub',
  },
});

const google = env.GOOGLE_GENERATIVE_AI_API_KEY
  ? createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })
  : null;

const onModelError = (context: {
  current: { model: { provider: string; modelId: string }; error?: unknown };
}) => {
  const { model, error } = context.current;
  const err = APICallError.isInstance(error)
    ? { status: error.statusCode, message: error.message, url: error.url }
    : { message: error instanceof Error ? error.message : String(error) };
  logger.warn(
    { provider: model.provider, modelId: model.modelId, err },
    'model error, switching to next'
  );
};

const retry = (model: LanguageModel): Retry<LanguageModel> => ({
  model,
  ...RETRY,
});

const chatModel = createRetryable({
  model: hackclub.languageModel('google/gemini-3-flash-preview'),
  retries: [
    requestNotRetryable(hackclub.languageModel('openai/gpt-5.4-mini')),
    requestNotRetryable(
      openrouter.languageModel('google/gemini-3-flash-preview')
    ),
    retry(hackclub.languageModel('openai/gpt-5.4-mini')),
    retry(openrouter.languageModel('google/gemini-3-flash-preview')),
    retry(openrouter.languageModel('openai/gpt-5.4-mini')),
  ],
  onError: onModelError,
});

const summariserModel = createRetryable({
  model: hackclub.languageModel('google/gemini-3.1-flash-lite-preview'),
  retries: [
    requestNotRetryable(
      openrouter.languageModel('google/gemini-3.1-flash-lite-preview')
    ),
    ...(google
      ? [requestNotRetryable(google('gemini-3.1-flash-lite-preview'))]
      : []),
    retry(hackclub.languageModel('openai/gpt-5-nano')),
    retry(openrouter.languageModel('google/gemini-3.1-flash-lite-preview')),
    retry(openrouter.languageModel('openai/gpt-5-nano')),
  ],
  onError: onModelError,
});

export const provider: Provider = customProvider({
  languageModels: {
    'chat-model': chatModel,
    'summariser-model': summariserModel,
  },
  imageModels: {
    'image-model': hackclub.imageModel('google/gemini-3.1-flash-image-preview'),
  },
});
