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

const RETRY = {
  maxAttempts: 4,
  delay: 250,
  backoffFactor: 2,
} satisfies Omit<Retry<LanguageModel>, 'model'>;

interface ChatModelOptions {
  allowDataTraining?: boolean;
  onFallback?: () => void;
}

const hcBase = createOpenRouter({
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

const hc = wrapProvider({
  provider: hcBase,
  languageModelMiddleware: {
    specificationVersion: 'v3',
    overrideProvider: () => 'hackclub',
  },
  imageModelMiddleware: {
    specificationVersion: 'v3',
    overrideProvider: () => 'hackclub',
  },
});

const logModelError = (context: RetryContext<LanguageModel>) => {
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

export function createChatLanguageModel({
  allowDataTraining = true,
  onFallback,
}: ChatModelOptions = {}): LanguageModel {
  let reported = false;

  const mark = () => {
    if (reported) {
      return;
    }
    reported = true;
    onFallback?.();
  };

  const training =
    (model: LanguageModel | undefined): Retryable<LanguageModel> =>
    () => {
      if (!(allowDataTraining && model)) {
        return;
      }
      mark();
      return retry(model);
    };

  return createRetryable({
    model: hc.languageModel('google/gemini-3-flash-preview'),
    retries: [
      training(openrouter?.languageModel('google/gemini-3-flash-preview:free')),
      requestNotRetryable(
        inference.languageModel('google/gemini-3-flash-preview')
      ),
      training(
        openrouter?.languageModel('google/gemini-3.1-flash-lite-preview:free')
      ),
      training(google?.('gemini-3-flash-preview')),
      hc.languageModel('openai/gpt-5-mini'),
      inference.languageModel('google/gemini-3-flash-preview'),
      training(google?.('gemini-3-flash-preview')),
      inference.languageModel('openai/gpt-5-mini'),
    ],
    onError: logModelError,
  });
}

const summariserModel = createRetryable({
  model: hc.languageModel('google/gemini-3.1-flash-lite-preview'),
  retries: [
    requestNotRetryable(
      inference.languageModel('google/gemini-3.1-flash-lite-preview')
    ),
    ...(google
      ? [requestNotRetryable(google('gemini-3.1-flash-lite-preview'))]
      : []),
    hc.languageModel('openai/gpt-5-nano'),
    inference.languageModel('google/gemini-3.1-flash-lite-preview'),
    inference.languageModel('openai/gpt-5-nano'),
  ],
  onError: logModelError,
});

export const provider: Provider = customProvider({
  languageModels: {
    'chat-model': createChatLanguageModel(),
    'summariser-model': summariserModel,
  },
  imageModels: {
    'image-model': hc.imageModel('google/gemini-3.1-flash-image-preview'),
  },
});
