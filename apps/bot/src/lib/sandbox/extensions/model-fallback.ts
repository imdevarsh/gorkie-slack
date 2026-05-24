import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';

interface FallbackConfig {
  fallback: string[];
  timeoutMs: number;
}

export default function modelFallback(pi: ExtensionAPI) {
  let config: FallbackConfig = { timeoutMs: 90_000, fallback: [] };
  let currentModel = '';
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cleanup() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (controller !== null) {
      controller.abort();
      controller = null;
    }
  }

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

  async function tryFallback(
    ctx: ExtensionContext,
    attempts = 0
  ): Promise<void> {
    if (attempts >= config.fallback.length) {
      return;
    }
    const next = nextFallback(currentModel);
    if (!next) {
      cleanup();
      return;
    }

    controller?.abort();
    controller = null;
    timer = null;

    const slash = next.indexOf('/');
    const provider = next.slice(0, slash);
    const modelId = next.slice(slash + 1);

    let model = ctx.modelRegistry.find(provider, modelId);
    if (!model) {
      const available = await ctx.modelRegistry.getAvailable();
      model = available.find(
        (m) => `${m.provider}/${m.id}` === next || m.id === modelId
      );
    }

    if (!(model && (await pi.setModel(model)))) {
      currentModel = next;
      return tryFallback(ctx, attempts + 1);
    }

    currentModel = next;
    controller = new AbortController();
    timer = setTimeout(() => tryFallback(ctx), config.timeoutMs);
  }

  pi.on('session_start', (_e, ctx) => {
    const path = join(ctx.cwd, '.pi', 'model-fallback.json');
    if (existsSync(path)) {
      try {
        config = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        // ignore malformed config
      }
    }
  });

  pi.on('model_select', (e) => {
    currentModel = `${e.model.provider}/${e.model.id}`;
  });

  pi.on('before_provider_request', (e, ctx) => {
    cleanup();
    controller = new AbortController();
    timer = setTimeout(() => tryFallback(ctx), config.timeoutMs);
    const payload = e.payload as unknown as {
      options?: Record<string, unknown>;
    };
    if (payload?.options && typeof payload.options === 'object') {
      payload.options.signal = controller.signal;
    }
    return payload;
  });

  pi.on('agent_end', cleanup);
}
