import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createLogger } from '@repo/logging/log';
import { APICallError, customProvider, type Provider, wrapProvider } from 'ai';
import {
  createRetryable,
  type LanguageModel,
  type Retry,
  type Retryable,
  type RetryContext,
} from 'ai-retry';
import { requestNotRetryable } from 'ai-retry/retryables';

import { keys } from './keys';

const logger = await createLogger({ fileLogging: false });

const env = keys();

const RETRY_OPTIONS = {
  maxAttempts: 4,
  delay: 250,
  backoffFactor: 2,
} satisfies Omit<Retry<LanguageModel>, 'model'>;

interface ChatModelOptions {
  allowDataTraining?: boolean;
  onDataTrainingFallback?: () => void;
}

const hackclubBase = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: 'https://ai.hackclub.com/proxy/v1',
});

const inference = createOpenRouter({
  apiKey: env.INFERENCE_API_KEY,
  baseURL: env.INFERENCE_BASE_URL ?? undefined,
});

const openrouter = env.OPENROUTER_API_KEY
  ? createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
  : null;

const google = env.GOOGLE_GENERATIVE_AI_API_KEY
  ? createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })
  : null;

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

const onModelError = (context: RetryContext<LanguageModel>) => {
  const { model, error } = context.current;
  const err = APICallError.isInstance(error)
    ? { status: error.statusCode, message: error.message, url: error.url }
    : { message: error instanceof Error ? error.message : String(error) };
  logger.warn(
    { provider: model.provider, modelId: model.modelId, err },
    'model error, switching to next'
  );
};

function retryWith(model: LanguageModel): Retry<LanguageModel> {
  return { model, ...RETRY_OPTIONS };
}

export function createChatLanguageModel({
  allowDataTraining = true,
  onDataTrainingFallback,
}: ChatModelOptions = {}): LanguageModel {
  let fallbackReported = false;

  const reportDataTrainingFallback = () => {
    if (fallbackReported) {
      return;
    }
    fallbackReported = true;
    onDataTrainingFallback?.();
  };

  const dataTrainingFallback =
    (model: LanguageModel): Retryable<LanguageModel> =>
    () => {
      if (!allowDataTraining) {
        return;
      }
      reportDataTrainingFallback();
      return retryWith(model);
    };

  const openrouterFallback =
    (modelId: string): Retryable<LanguageModel> =>
    () => {
      if (!allowDataTraining) {
        return;
      }
      if (!openrouter) {
        return;
      }
      reportDataTrainingFallback();
      return retryWith(openrouter.languageModel(modelId));
    };

  return createRetryable({
    model: hackclub.languageModel('google/gemini-3-flash-preview'),
    retries: [
      openrouterFallback('google/gemini-3-flash-preview:free'),
      requestNotRetryable(
        inference.languageModel('google/gemini-3-flash-preview')
      ),
      openrouterFallback('google/gemini-3.1-flash-lite-preview:free'),
      ...(google
        ? [dataTrainingFallback(google('gemini-3-flash-preview'))]
        : []),
      hackclub.languageModel('openai/gpt-5-mini'),
      inference.languageModel('google/gemini-3-flash-preview'),
      ...(google
        ? [dataTrainingFallback(google('gemini-3-flash-preview'))]
        : []),
      inference.languageModel('openai/gpt-5-mini'),
    ],
    onError: onModelError,
  });
}

const summariserModel = createRetryable({
  model: hackclub.languageModel('google/gemini-3.1-flash-lite-preview'),
  retries: [
    requestNotRetryable(
      inference.languageModel('google/gemini-3.1-flash-lite-preview')
    ),
    ...(google
      ? [requestNotRetryable(google('gemini-3.1-flash-lite-preview'))]
      : []),
    hackclub.languageModel('openai/gpt-5-nano'),
    inference.languageModel('google/gemini-3.1-flash-lite-preview'),
    inference.languageModel('openai/gpt-5-nano'),
  ],
  onError: onModelError,
});

export const provider: Provider = customProvider({
  languageModels: {
    'chat-model': createChatLanguageModel(),
    'summariser-model': summariserModel,
  },
  imageModels: {
    'image-model': hackclub.imageModel('google/gemini-3.1-flash-image-preview'),
  },
});
