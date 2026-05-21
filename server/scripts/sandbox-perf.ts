import { parseArgs } from 'node:util';
import { Sandbox } from '@e2b/code-interpreter';
import { sandbox as defaultConfig } from '~/config';
import { env } from '~/env';
import { sandboxPrompt } from '~/lib/ai/prompts/sandbox';
import logger from '~/lib/logger';
import { configureAgent } from '~/lib/sandbox/config';
import { runWithModelRetry } from '~/lib/sandbox/model-retry';
import { boot } from '~/lib/sandbox/rpc/boot';
import type { AgentSessionEvent } from '~/types/sandbox/rpc';

const TEST_PROMPT = `
Do all three of the following steps:

1. Run: echo "Hello from Gorkie! 🎉"
2. Create a fun, colorful HTML page at /home/user/output/index.html with a CSS animation and the heading "Hello from Gorkie!"
3. Use ffmpeg to generate a 1-second 440 Hz audio beep at /home/user/output/beep.mp3:
   ffmpeg -f lavfi -i "sine=frequency=440:duration=1" /home/user/output/beep.mp3

Say hi and summarize what you made at the end.
`.trim();

interface PhaseTiming {
  error?: string;
  firstLlmResponseMs: number;
  piReadyMs: number;
  sandboxCreateMs: number;
  success: boolean;
  template: string;
  toolsCalled: string[];
  totalMs: number;
}

async function runPerfTest(template: string): Promise<PhaseTiming> {
  const t0 = Date.now();
  let tSandboxCreated = 0;
  let tPiReady = 0;
  let tFirstLlm = 0;
  const toolsCalled: string[] = [];
  let firstLlm = false;

  logger.info({ template }, '[perf] Creating sandbox');

  let sandbox: Sandbox | undefined;
  try {
    sandbox = await Sandbox.betaCreate(template, {
      apiKey: env.E2B_API_KEY,
      timeoutMs: defaultConfig.timeoutMs,
      autoPause: false,
      allowInternetAccess: true,
    });
    tSandboxCreated = Date.now() - t0;
    logger.info(
      { template, sandboxCreateMs: tSandboxCreated },
      '[perf] Sandbox ready'
    );

    await configureAgent(sandbox, sandboxPrompt());
    const client = await boot(sandbox);
    tPiReady = Date.now() - t0;
    logger.info({ template, piReadyMs: tPiReady }, '[perf] Pi agent ready');

    const events: AgentSessionEvent[] = [];
    const unsubscribe = client.onEvent((event) => {
      events.push(event);
      if (
        !firstLlm &&
        event.type === 'message_end' &&
        event.message.role === 'assistant'
      ) {
        firstLlm = true;
        tFirstLlm = Date.now() - t0;
      }
      if (event.type === 'tool_execution_start') {
        toolsCalled.push(event.toolName);
      }
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('[perf] Execution timed out')),
        defaultConfig.runtime.executionTimeoutMs
      )
    );

    try {
      await runWithModelRetry({
        client,
        prompt: TEST_PROMPT,
        timeoutPromise,
        ctxId: 'sandbox-perf',
        onModelSwitch: (attempt, total) => {
          logger.warn({ attempt, total, template }, '[perf] Model switch');
        },
      });
    } finally {
      unsubscribe();
    }

    const totalMs = Date.now() - t0;
    logger.info({ template, totalMs }, '[perf] Completed');

    return {
      template,
      sandboxCreateMs: tSandboxCreated,
      piReadyMs: tPiReady,
      firstLlmResponseMs: tFirstLlm,
      totalMs,
      toolsCalled,
      success: true,
    };
  } catch (err) {
    return {
      template,
      sandboxCreateMs: tSandboxCreated,
      piReadyMs: tPiReady,
      firstLlmResponseMs: tFirstLlm,
      totalMs: Date.now() - t0,
      toolsCalled,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (sandbox) {
      await Sandbox.kill(sandbox.sandboxId, { apiKey: env.E2B_API_KEY }).catch(
        () => null
      );
      logger.info({ template }, '[perf] Sandbox killed');
    }
  }
}

function formatMs(ms: number): string {
  return ms > 0 ? `${(ms / 1000).toFixed(1)}s` : 'n/a';
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      templates: {
        type: 'string',
        short: 't',
        default: 'gorkie-sandbox:1.1.2,gorkie-sandbox:3.0',
      },
    },
    strict: false,
  });

  const templates = (values.templates as string)
    .split(',')
    .map((t) => t.trim());
  logger.info({ templates }, '[perf] Starting benchmark');

  const results: PhaseTiming[] = [];
  for (const template of templates) {
    logger.info({ template }, '[perf] --- Running ---');
    const result = await runPerfTest(template);
    results.push(result);
    process.stdout.write('\n');
  }

  process.stdout.write('\n=== PERF RESULTS ===\n');
  process.stdout.write(
    `${'Template'.padEnd(28)} ${'Create'.padStart(8)} ${'Pi ready'.padStart(10)} ${'1st LLM'.padStart(9)} ${'Total'.padStart(8)} ${'Tools'.padStart(5)} ${'OK?'.padStart(4)}\n`
  );
  process.stdout.write(
    `${'-'.repeat(28)} ${'-'.repeat(8)} ${'-'.repeat(10)} ${'-'.repeat(9)} ${'-'.repeat(8)} ${'-'.repeat(5)} ${'-'.repeat(4)}\n`
  );

  for (const r of results) {
    process.stdout.write(
      `${r.template.padEnd(28)} ${formatMs(r.sandboxCreateMs).padStart(8)} ${formatMs(r.piReadyMs).padStart(10)} ${formatMs(r.firstLlmResponseMs).padStart(9)} ${formatMs(r.totalMs).padStart(8)} ${String(r.toolsCalled.length).padStart(5)} ${(r.success ? '✓' : '✗').padStart(4)}\n`
    );
    if (!r.success) {
      process.stdout.write(`  error: ${r.error}\n`);
    }
  }
  process.stdout.write('\n');
}

main().catch((error: unknown) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    '[perf] Failed'
  );
  process.exit(1);
});
