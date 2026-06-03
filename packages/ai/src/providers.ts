import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createLogger } from '@repo/logging/logger';
import {
  APICallError,
  customProvider,
  type Provider,
  wrapLanguageModel,
  wrapProvider,
} from 'ai';
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

const noParallel = { parallelToolCalls: false } as const;
const hackclubMiddleware = {
  specificationVersion: 'v3' as const,
  overrideProvider: () => 'hackclub',
};

// Use hackclubBase directly (accepts settings) then re-wrap for provider name
const hc = (modelId: string) =>
  wrapLanguageModel({
    model: hackclubBase.languageModel(modelId, noParallel),
    middleware: hackclubMiddleware,
  });
const or = (modelId: string) => openrouter.languageModel(modelId, noParallel);

// Fallback chain (priority order). Every model gets the retry treatment:
// a permanent error jumps straight to the next model, while a retryable error
// retries each model — including the primary — with backoff.
function retryableChain([primary, ...rest]: [
  LanguageModel,
  ...LanguageModel[],
]) {
  return createRetryable({
    model: primary,
    retries: [
      ...rest.map((model) => requestNotRetryable(model)),
      ...[primary, ...rest].map((model) => retry(model)),
    ],
    onError: onModelError,
  });
}

const chatModel = retryableChain([
  hc('openai/gpt-5.4-mini'),
  hc('google/gemini-3-flash-preview'),
  or('google/gemini-3-flash-preview'),
  or('openai/gpt-5.4-mini'),
]);

const summariserModel = retryableChain([
  hackclub.languageModel('google/gemini-3.1-flash-lite-preview'),
  openrouter.languageModel('google/gemini-3.1-flash-lite-preview'),
  ...(google ? [google('gemini-3.1-flash-lite-preview')] : []),
  hackclub.languageModel('openai/gpt-5-nano'),
  openrouter.languageModel('openai/gpt-5-nano'),
]);

export const provider: Provider = customProvider({
  languageModels: {
    'chat-model': chatModel,
    'summariser-model': summariserModel,
  },
  imageModels: {
    'image-model': hackclub.imageModel('google/gemini-3.1-flash-image-preview'),
  },
});
