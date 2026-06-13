import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createLogger } from '@repo/logging/logger';
import { APICallError, customProvider, type Provider, wrapProvider } from 'ai';
import { createRetryable, type LanguageModel, type Retry } from 'ai-retry';

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

// --- ai-retry v6 ↔ v7 type bridge ---
// ai-retry@1.7.4 is typed against AI SDK v6's LanguageModel union. Under v7 the
// union identity changed (provider spec added LanguageModelV4) but the
// LanguageModelV2 runtime contract ai-retry delegates to is unchanged, so these
// casts are type-only and runtime-safe. Remove when ai-retry ships v7 types.
// See TODO.md "ai-retry v7 type bridge".
// Inputs are mixed-spec models (wrapProvider yields v7 LanguageModelV4; the raw
// OpenRouter/Google providers yield LanguageModelV2) — all V2-shaped at runtime.
type ModelV7 = ReturnType<typeof hackclub.languageModel>;
const toRetry = (model: unknown): LanguageModel => model as LanguageModel;
const fromRetry = (model: LanguageModel): ModelV7 =>
  model as unknown as ModelV7;

const retry = (model: unknown): Retry<LanguageModel> => ({
  model: toRetry(model),
  backoffFactor: 2,
  delay: 250,
  maxAttempts: 2,
});

const chatModel = createRetryable({
  model: toRetry(hackclub.languageModel('google/gemini-3-flash-preview')),
  retries: [
    retry(hackclub.languageModel('openai/gpt-5.4-mini')),
    retry(openrouter.languageModel('google/gemini-3-flash-preview')),
    retry(openrouter.languageModel('openai/gpt-5.4-mini')),
  ],
  onError: onModelError,
});

const summariserModel = createRetryable({
  model: toRetry(
    hackclub.languageModel('google/gemini-3.1-flash-lite-preview')
  ),
  retries: [
    retry(openrouter.languageModel('google/gemini-3.1-flash-lite-preview')),
    ...(google ? [retry(google('gemini-3.1-flash-lite-preview'))] : []),
    retry(hackclub.languageModel('openai/gpt-5-nano')),
    retry(openrouter.languageModel('openai/gpt-5-nano')),
  ],
  onError: onModelError,
});

export const CHAT_MODEL_ID = 'google/gemini-3-flash-preview';

export const provider: Provider = customProvider({
  languageModels: {
    'chat-model': fromRetry(chatModel),
    'summariser-model': fromRetry(summariserModel),
  },
  imageModels: {
    'image-model': hackclub.imageModel('google/gemini-3.1-flash-image-preview'),
  },
});
