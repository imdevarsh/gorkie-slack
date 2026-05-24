import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Api, Model } from '@earendil-works/pi-ai';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';

const FALLBACK_ERROR_MARKERS = [
  'overloaded',
  'provider returned error',
  'rate limit',
  'too many requests',
  '429',
  '500',
  '502',
  '503',
  '504',
  'server error',
  'internal error',
  'service unavailable',
  'timed out',
  'timeout',
  'retry delay',
];

interface FallbackConfig {
  fallback: string[];
}

function loadFallbackConfig(cwd: string): FallbackConfig {
  try {
    const settingsPath = join(cwd, '.pi', 'agent', 'settings.json');
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      fallbackModels?: unknown;
    };
    if (!Array.isArray(parsed.fallbackModels)) {
      return { fallback: [] };
    }
    return {
      fallback: parsed.fallbackModels.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.includes('/')
      ),
    };
  } catch {
    return { fallback: [] };
  }
}

export default function modelFallback(pi: ExtensionAPI) {
  let config: FallbackConfig = { fallback: [] };
  let currentModel = '';

  function nextFallback(current: string): string | null {
    const idx = config.fallback.findIndex((e) => {
      if (e === current) {
        return true;
      }
      const s = current.indexOf('/');
      return s > 0 && e.endsWith(current.slice(s));
    });
    return idx === -1
      ? (config.fallback[0] ?? null)
      : (config.fallback[idx + 1] ?? null);
  }

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

    let model = ctx.modelRegistry.find(provider, modelId);
    if (!model) {
      const available = await ctx.modelRegistry.getAvailable();
      model = available.find(
        (m) => `${m.provider}/${m.id}` === next || m.id === modelId
      );
    }

    return model;
  }

  function isRetryableError(message: {
    errorMessage?: string;
    role: string;
    stopReason?: string;
  }): boolean {
    return (
      message.role === 'assistant' &&
      message.stopReason === 'error' &&
      typeof message.errorMessage === 'string' &&
      FALLBACK_ERROR_MARKERS.some((marker) =>
        message.errorMessage?.toLowerCase().includes(marker)
      )
    );
  }

  async function switchToNextFallback(ctx: ExtensionContext): Promise<void> {
    const attempted = new Set<string>();

    while (attempted.size < config.fallback.length) {
      const next = nextFallback(currentModel);
      if (!(next && !attempted.has(next))) {
        return;
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
        content: `Provider request failed. Switched to fallback model: **${currentModel}**. Pi will retry automatically.`,
        display: true,
      });
      return;
    }
  }

  pi.on('session_start', (_e, ctx) => {
    config = loadFallbackConfig(ctx.cwd);
    if (ctx.model) {
      currentModel = `${ctx.model.provider}/${ctx.model.id}`;
    }
  });

  pi.on('model_select', (e) => {
    currentModel = `${e.model.provider}/${e.model.id}`;
  });

  pi.on('message_end', async (e, ctx) => {
    if (isRetryableError(e.message)) {
      await switchToNextFallback(ctx);
    }
  });
}
