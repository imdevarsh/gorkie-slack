import { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '~/config';
import { env } from '~/env';
import { sandboxPrompt } from '~/lib/ai/prompts/sandbox';
import logger from '~/lib/logger';
import { configureAgent } from '~/lib/sandbox/config';
import { runWithModelRetry } from '~/lib/sandbox/model-retry';
import { proxyApp } from '~/lib/sandbox/proxy/app';
import { issueToken, revokeToken } from '~/lib/sandbox/proxy/tokens';
import { boot } from '~/lib/sandbox/rpc/boot';

const PROXY_PORT = 13_001;

const TEST_PROMPT = `Run: echo "Hello from Gorkie via proxy! 🔐" and say hi.`;

// ─── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function expect(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    logger.info(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`  ✗ ${label}: ${msg}`);
    failed++;
  }
}

function proxyRequest(
  path: string,
  opts: {
    auth?: string | null;
    method?: string;
    body?: unknown;
  } = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Disable compression — prevents zstd decompression errors in the test client
    'Accept-Encoding': 'identity',
  };
  if (opts.auth !== null) {
    // biome-ignore lint/complexity/useLiteralKeys: dynamic header name
    headers['Authorization'] = opts.auth ?? '';
  }
  return fetch(`http://localhost:${PROXY_PORT}${path}`, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

function assertStatus(res: Response, status: number): void {
  if (res.status !== status) {
    throw new Error(`Expected HTTP ${status}, got ${res.status}`);
  }
}

// ─── auth attack suite ────────────────────────────────────────────────────────

async function runAuthTests(): Promise<void> {
  logger.info('[proxy-test] --- Auth & token security tests ---');

  const [validToken, otherToken] = await Promise.all([
    issueToken({ sandboxId: 'test-sandbox-auth' }),
    issueToken({ sandboxId: 'other-sandbox' }),
  ]);

  const body = {
    model: 'google/gemini-3-flash-preview',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 1,
  };

  await expect('no Authorization header → 401', async () => {
    const res = await proxyRequest('/hackclub/chat/completions', {
      auth: null,
      body,
    });
    assertStatus(res, 401);
  });

  await expect('empty Bearer token → 401', async () => {
    const res = await proxyRequest('/hackclub/chat/completions', {
      auth: 'Bearer ',
      body,
    });
    assertStatus(res, 401);
  });

  await expect('wrong scheme (Token ...) → 401', async () => {
    const res = await proxyRequest('/hackclub/chat/completions', {
      auth: `Token ${validToken}`,
      body,
    });
    assertStatus(res, 401);
  });

  await expect('random forged token → 401', async () => {
    const res = await proxyRequest('/hackclub/chat/completions', {
      auth: 'Bearer deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      body,
    });
    assertStatus(res, 401);
  });

  await expect('JWT-shaped forged token → 401', async () => {
    const fake =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdHRhY2tlciJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const res = await proxyRequest('/hackclub/chat/completions', {
      auth: `Bearer ${fake}`,
      body,
    });
    assertStatus(res, 401);
  });

  await expect('revoked token → 401', async () => {
    const token = await issueToken({ sandboxId: 'revoke-test' });
    await revokeToken({ sandboxId: 'revoke-test' });
    const res = await proxyRequest('/hackclub/chat/completions', {
      auth: `Bearer ${token}`,
      body,
    });
    assertStatus(res, 401);
  });

  await expect('valid token → unknown provider → 400', async () => {
    const res = await proxyRequest('/fakeai/chat/completions', {
      auth: `Bearer ${validToken}`,
      body,
    });
    assertStatus(res, 400);
  });

  await expect(
    'provider whitelist: only configured providers reachable',
    async () => {
      // The PROVIDERS map is built from config.modelChain — no arbitrary URL injection possible.
      // Even if an attacker gets a valid token, they can only reach hackclub/openrouter/gemini.
      for (const unlisted of ['anthropic', 'aws', 'azure', 'internal']) {
        const res = await proxyRequest(`/${unlisted}/chat/completions`, {
          auth: `Bearer ${validToken}`,
          body,
        });
        if (res.status !== 400) {
          throw new Error(
            `Provider "${unlisted}" returned ${res.status}, expected 400`
          );
        }
      }
    }
  );

  await expect(
    'URL path traversal: Bun normalizes /../provider before send (client-side prevention)',
    async () => {
      // fetch() normalizes /../hackclub → /hackclub before the TCP frame is sent.
      // The proxy never even sees the traversal characters — it receives a clean /hackclub path.
      // This test documents that behavior and confirms the request is either forwarded (2xx/4xx from
      // upstream) or rejected by auth — but NOT that arbitrary paths escape the provider whitelist.
      const res = await proxyRequest('/../hackclub/chat/completions', {
        auth: `Bearer ${validToken}`,
        body,
      });
      // Should reach upstream (200) or fail at upstream (4xx) — never a proxy auth bypass
      if (res.status === 401) {
        throw new Error('Normalized path incorrectly rejected by proxy auth');
      }
    }
  );

  await expect(
    'cross-sandbox token valid (tokens prove gorkie session, not per-sandbox)',
    async () => {
      // Any sandbox that has a valid gorkie token can call any configured provider.
      // This is intentional: the key invariant is "real API keys never leave the proxy".
      const res = await proxyRequest('/hackclub/chat/completions', {
        auth: `Bearer ${otherToken}`,
        body,
      });
      if (res.status === 401) {
        throw new Error(
          'Valid cross-sandbox token was rejected — expected passthrough'
        );
      }
    }
  );

  await Promise.all([
    revokeToken({ sandboxId: 'test-sandbox-auth' }),
    revokeToken({ sandboxId: 'other-sandbox' }),
  ]);
}

// ─── full e2e sandbox test ────────────────────────────────────────────────────

async function runE2ETest(): Promise<void> {
  logger.info('[proxy-test] --- E2E sandbox-through-proxy test ---');

  let sandbox: Sandbox | undefined;
  try {
    sandbox = await Sandbox.betaCreate(config.template, {
      apiKey: env.E2B_API_KEY,
      timeoutMs: config.timeoutMs,
      autoPause: false,
      allowInternetAccess: true,
    });
    logger.info(
      { sandboxId: sandbox.sandboxId },
      '[proxy-test] Sandbox created'
    );

    await configureAgent(sandbox, sandboxPrompt());
    logger.info('[proxy-test] Agent configured (proxy mode)');

    const client = await boot(sandbox);
    logger.info('[proxy-test] Pi agent ready');

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('E2E timeout')),
        config.runtime.executionTimeoutMs
      )
    );

    let gotAssistantMessage = false;
    const unsubscribe = client.onEvent((event) => {
      if (event.type === 'message_update') {
        const { assistantMessageEvent } = event;
        if (
          assistantMessageEvent.type === 'text_delta' &&
          typeof assistantMessageEvent.delta === 'string'
        ) {
          process.stdout.write(assistantMessageEvent.delta);
          gotAssistantMessage = true;
        }
      }
    });

    try {
      await runWithModelRetry({
        client,
        prompt: TEST_PROMPT,
        timeoutPromise,
        ctxId: 'proxy-test',
        onModelSwitch: (attempt, total) => {
          logger.warn({ attempt, total }, '[proxy-test] Model switch');
        },
      });
    } finally {
      unsubscribe();
    }

    process.stdout.write('\n');

    if (!gotAssistantMessage) {
      throw new Error('No assistant message received');
    }

    logger.info(
      '[proxy-test] E2E test passed — sandbox ran through proxy successfully'
    );
    passed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[proxy-test] E2E test FAILED: ${msg}`);
    failed++;
  } finally {
    if (sandbox) {
      await Sandbox.kill(sandbox.sandboxId, { apiKey: env.E2B_API_KEY }).catch(
        () => null
      );
      logger.info(
        { sandboxId: sandbox.sandboxId },
        '[proxy-test] Sandbox killed'
      );
    }
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const server = Bun.serve({ fetch: proxyApp.fetch, port: PROXY_PORT });
  logger.info({ port: PROXY_PORT }, '[proxy-test] Proxy server started');

  try {
    await runAuthTests();
    await runE2ETest();
  } finally {
    server.stop();
  }

  process.stdout.write('\n');
  process.stdout.write('=== PROXY TEST RESULTS ===\n');
  process.stdout.write(`  Passed: ${passed}\n`);
  process.stdout.write(`  Failed: ${failed}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    '[proxy-test] Fatal error'
  );
  process.exit(1);
});
