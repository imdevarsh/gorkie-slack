import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createLogger } from '@repo/logging/logger';
import { APICallError, customProvider, type Provider, wrapProvider } from 'ai';

import { keys } from './keys';

const logger = await createLogger({ fileLogging: false });
const env = keys();

const hackclubBase = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: 'https://ai.hackclub.com/proxy/v1',
});

const openrouterBase = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL ?? undefined,
});

const hackclub = wrapProvider({
  provider: hackclubBase,
  languageModelMiddleware: {
    specificationVersion: 'v4',
    overrideProvider: () => 'hackclub',
  },
  imageModelMiddleware: {
    specificationVersion: 'v4',
    overrideProvider: () => 'hackclub',
  },
});

const google = env.GOOGLE_GENERATIVE_AI_API_KEY
  ? createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })
  : null;

const openrouter = wrapProvider({
  provider: openrouterBase,
  languageModelMiddleware: {},
});

type LanguageModel = ReturnType<typeof hackclub.languageModel>;
type GenerateOptions = Parameters<LanguageModel['doGenerate']>[0];
type StreamOptions = Parameters<LanguageModel['doStream']>[0];

const retryDelayMs = 250;
const retryBackoffFactor = 2;
const maxAttempts = 2;

function logModelError({
  error,
  model,
}: {
  error: unknown;
  model: LanguageModel;
}) {
  const err = APICallError.isInstance(error)
    ? { status: error.statusCode, message: error.message, url: error.url }
    : { message: error instanceof Error ? error.message : String(error) };
  logger.warn(
    { provider: model.provider, modelId: model.modelId, err },
    'model error, switching to next'
  );
}

async function waitForRetry({
  abortSignal,
  delayMs,
}: {
  abortSignal?: AbortSignal;
  delayMs: number;
}) {
  if (abortSignal?.aborted) {
    throw abortSignal.reason;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    abortSignal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(abortSignal.reason);
      },
      { once: true }
    );
  });
}

function fallbackModel({
  models,
}: {
  models: [LanguageModel, ...LanguageModel[]];
}): LanguageModel {
  const [primary] = models;

  return {
    specificationVersion: 'v4',
    provider: primary.provider,
    modelId: primary.modelId,
    supportedUrls: primary.supportedUrls,
    async doGenerate(options: GenerateOptions) {
      let lastError: unknown;

      for (const model of models) {
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            return await model.doGenerate(options);
          } catch (error) {
            lastError = error;
            logModelError({ error, model });

            const isLastModel = model === models.at(-1);
            const isLastAttempt = attempt === maxAttempts;
            if (isLastModel && isLastAttempt) {
              throw error;
            }
            if (!isLastAttempt) {
              await waitForRetry({
                abortSignal: options.abortSignal,
                delayMs:
                  retryDelayMs * retryBackoffFactor ** Math.max(0, attempt - 1),
              });
            }
          }
        }
      }

      throw lastError;
    },
    async doStream(options: StreamOptions) {
      let lastError: unknown;

      for (const model of models) {
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            return await model.doStream(options);
          } catch (error) {
            lastError = error;
            logModelError({ error, model });

            const isLastModel = model === models.at(-1);
            const isLastAttempt = attempt === maxAttempts;
            if (isLastModel && isLastAttempt) {
              throw error;
            }
            if (!isLastAttempt) {
              await waitForRetry({
                abortSignal: options.abortSignal,
                delayMs:
                  retryDelayMs * retryBackoffFactor ** Math.max(0, attempt - 1),
              });
            }
          }
        }
      }

      throw lastError;
    },
  };
}

const chatModel = fallbackModel({
  models: [
    hackclub.languageModel('google/gemini-3-flash-preview'),
    hackclub.languageModel('openai/gpt-5.4-mini'),
    openrouter.languageModel('google/gemini-3-flash-preview'),
    openrouter.languageModel('openai/gpt-5.4-mini'),
  ],
});

const summariserModel = fallbackModel({
  models: [
    hackclub.languageModel('google/gemini-3.1-flash-lite-preview'),
    openrouter.languageModel('google/gemini-3.1-flash-lite-preview'),
    ...(google ? [google('gemini-3.1-flash-lite-preview')] : []),
    hackclub.languageModel('openai/gpt-5-nano'),
    openrouter.languageModel('openai/gpt-5-nano'),
  ],
});

export const CHAT_MODEL_ID = 'google/gemini-3-flash-preview';

export const provider: Provider = customProvider({
  languageModels: {
    'chat-model': chatModel,
    'summariser-model': summariserModel,
  },
  imageModels: {
    'image-model': hackclub.imageModel('google/gemini-3.1-flash-image-preview'),
  },
});
