import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Api, Model } from '@earendil-works/pi-ai';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { isRetryableError } from './retry';

interface Config {
  fallback: string[];
}

function loadConfig(cwd: string): Config {
  try {
    const parsed = JSON.parse(
      readFileSync(join(cwd, '.pi', 'agent', 'settings.json'), 'utf8')
    ) as { fallbackModels?: unknown };

    return {
      fallback: Array.isArray(parsed.fallbackModels)
        ? parsed.fallbackModels.filter(
            (entry): entry is string =>
              typeof entry === 'string' && entry.includes('/')
          )
        : [],
    };
  } catch {
    return { fallback: [] };
  }
}

export default function modelFallback(pi: ExtensionAPI) {
  let config: Config = { fallback: [] };
  let currentModel = '';

  async function resolveModel(
    ctx: ExtensionContext,
    next: string
  ): Promise<Model<Api> | undefined> {
    const slash = next.indexOf('/');
    if (slash <= 0) {
      return;
    }

    const provider = next.slice(0, slash);
    const modelId = next.slice(slash + 1);
    const model = ctx.modelRegistry.find(provider, modelId);
    if (model) {
      return model;
    }

    const available = await ctx.modelRegistry.getAvailable();
    return available.find(
      (entry) =>
        `${entry.provider}/${entry.id}` === next || entry.id === modelId
    );
  }

  async function switchToFallback(ctx: ExtensionContext): Promise<boolean> {
    const attempted = new Set<string>();

    while (attempted.size < config.fallback.length) {
      const currentIndex = config.fallback.findIndex((entry) => {
        if (entry === currentModel) {
          return true;
        }
        const slash = currentModel.indexOf('/');
        return slash > 0 && entry.endsWith(currentModel.slice(slash));
      });
      const next =
        currentIndex === -1
          ? (config.fallback[0] ?? null)
          : (config.fallback[currentIndex + 1] ?? null);
      if (!(next && !attempted.has(next))) {
        return false;
      }

      attempted.add(next);
      const model = await resolveModel(ctx, next);
      if (!(model && (await pi.setModel(model)))) {
        currentModel = next;
        continue;
      }

      currentModel = `${model.provider}/${model.id}`;
      pi.sendMessage({
        customType: 'model-fallback',
        content: currentModel,
        display: true,
      });
      return true;
    }

    return false;
  }

  pi.on('session_start', (_event, ctx) => {
    config = loadConfig(ctx.cwd);
    if (ctx.model) {
      currentModel = `${ctx.model.provider}/${ctx.model.id}`;
    }
  });

  pi.on('model_select', (event) => {
    currentModel = `${event.model.provider}/${event.model.id}`;
  });

  pi.on('message_end', async (event, ctx) => {
    if (!(isRetryableError(event.message) && (await switchToFallback(ctx)))) {
      return;
    }

    const errorMessage =
      'errorMessage' in event.message &&
      typeof event.message.errorMessage === 'string'
        ? event.message.errorMessage
        : 'retryable provider error';

    return {
      message: {
        ...event.message,
        errorMessage: `provider returned error: ${errorMessage}`,
      },
    };
  });
}
