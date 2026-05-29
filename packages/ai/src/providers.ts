import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createLogger } from '@repo/logging/log';
import { APICallError, customProvider, type Provider, wrapProvider } from 'ai';
import {
  createRetryable,
  type LanguageModel,
  type RetryContext,
} from 'ai-retry';
import { requestNotRetryable } from 'ai-retry/retryables';

import { keys } from './keys';

const logger = await createLogger({ fileLogging: false });

const env = keys();

const hackclubBase = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: 'https://ai.hackclub.com/proxy/v1',
});

const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL ?? undefined,
});

const orFree = env.OPENROUTER_FREE_API_KEY
  ? createOpenRouter({ apiKey: env.OPENROUTER_FREE_API_KEY })
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

const google = env.GOOGLE_GENERATIVE_AI_API_KEY
  ? createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })
  : null;

// Per-request callbacks fired when a data-training model is selected as fallback.
const FALLBACK_CALLBACKS = new Map<string, () => void>();

export function registerFallbackCallback(id: string, cb: () => void): void {
  FALLBACK_CALLBACKS.set(id, cb);
}

export function unregisterFallbackCallback(id: string): void {
  FALLBACK_CALLBACKS.delete(id);
}

type GorkieOptions = { allowDataTraining?: boolean; requestId?: string };

function gorkieOpts(context: RetryContext<LanguageModel>): GorkieOptions {
  return (
    (context.current.options.providerOptions?.['x-gorkie'] as
      | GorkieOptions
      | undefined) ?? {}
  );
}

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

const chatModel = createRetryable({
  model: hackclub.languageModel('google/gemini-3-flash-preview'),
  retries: [
    // Non-retryable error: immediately switch to best available model
    (context) => {
      const { allowDataTraining = true } = gorkieOpts(context);
      const model =
        allowDataTraining && orFree
          ? orFree.languageModel('google/gemini-3-flash-preview:free')
          : openrouter.languageModel('google/gemini-3-flash-preview');
      return requestNotRetryable(model)(context);
    },
    // Non-retryable: second free option or skip if data training off
    (context) => {
      const { allowDataTraining = true } = gorkieOpts(context);
      if (!allowDataTraining) {
        return;
      }
      const model = orFree
        ? orFree.languageModel('google/gemini-3.1-flash-lite-preview:free')
        : google
          ? google('gemini-3-flash-preview')
          : null;
      if (!model) {
        return;
      }
      return requestNotRetryable(model)(context);
    },
    // Any error: hackclub gpt-5-mini (no data training)
    hackclub.languageModel('openai/gpt-5-mini'),
    // Any error: openrouter gemini via hackclub proxy (no data training)
    openrouter.languageModel('google/gemini-3-flash-preview'),
    // Any error: google native — only when data training allowed
    (context) => {
      const { allowDataTraining = true } = gorkieOpts(context);
      if (!(allowDataTraining && google)) {
        return;
      }
      return requestNotRetryable(google('gemini-3-flash-preview'))(context);
    },
    // Final fallback
    openrouter.languageModel('openai/gpt-5-mini'),
  ],
  onRetry: (context) => {
    const { allowDataTraining = true, requestId } = gorkieOpts(context);
    if (!(allowDataTraining && requestId)) {
      return;
    }

    const modelId = context.current.model.modelId ?? '';
    const isFreeModel = modelId.includes(':free');
    const isGoogleNative = context.current.model.provider === 'google';

    if (isFreeModel || isGoogleNative) {
      FALLBACK_CALLBACKS.get(requestId)?.();
    }
  },
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
    hackclub.languageModel('openai/gpt-5-nano'),
    openrouter.languageModel('google/gemini-3.1-flash-lite-preview'),
    openrouter.languageModel('openai/gpt-5-nano'),
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
