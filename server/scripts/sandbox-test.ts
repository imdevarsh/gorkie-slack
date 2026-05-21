import fs from 'node:fs';
import nodePath from 'node:path';
import { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '~/config';
import { env } from '~/env';
import { sandboxPrompt } from '~/lib/ai/prompts/sandbox';
import logger from '~/lib/logger';
import { configureAgent } from '~/lib/sandbox/config';
import { getResponse } from '~/lib/sandbox/events';
import { runWithModelRetry } from '~/lib/sandbox/model-retry';
import { boot } from '~/lib/sandbox/rpc/boot';
import type { AgentSessionEvent } from '~/types/sandbox/rpc';

const OUTPUT_DIR = './sandbox-test-output';

const TEST_PROMPT = `
Do all three of the following steps:

1. Run: echo "Hello from Gorkie! 🎉"
2. Create a fun, colorful HTML page at /home/user/output/index.html with a CSS animation and the heading "Hello from Gorkie!"
3. Use ffmpeg to generate a 1-second 440 Hz audio beep at /home/user/output/beep.mp3:
   ffmpeg -f lavfi -i "sine=frequency=440:duration=1" /home/user/output/beep.mp3

Upload both /home/user/output/index.html and /home/user/output/beep.mp3 with showFile once each is ready.

Say hi and summarize what you made at the end.
`.trim();

async function main(): Promise<void> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  logger.info({ template: config.template }, '[sandbox-test] Creating sandbox');

  const sandbox = await Sandbox.betaCreate(config.template, {
    apiKey: env.E2B_API_KEY,
    timeoutMs: config.timeoutMs,
    autoPause: false,
    allowInternetAccess: true,
  });

  logger.info(
    { sandboxId: sandbox.sandboxId },
    '[sandbox-test] Sandbox created'
  );

  try {
    await configureAgent(sandbox, sandboxPrompt());
    const client = await boot(sandbox);
    logger.info('[sandbox-test] Pi agent ready');

    const events: AgentSessionEvent[] = [];

    const unsubscribe = client.onEvent((event) => {
      events.push(event);

      if (
        event.type !== 'message_update' &&
        event.type !== 'tool_execution_update'
      ) {
        logger.debug({ event }, '[sandbox-test] event');
      }

      if (event.type === 'tool_execution_start') {
        logger.info(
          { tool: event.toolName, args: event.args },
          '[sandbox-test] Tool started'
        );
      }

      if (event.type === 'tool_execution_end') {
        logger.info(
          { tool: event.toolName, isError: event.isError },
          '[sandbox-test] Tool ended'
        );

        if (event.toolName === 'showFile') {
          const details = (event.result as Record<string, unknown> | null)
            ?.details;
          const filePath =
            details !== null &&
            typeof details === 'object' &&
            'path' in (details as object)
              ? (details as { path: unknown }).path
              : undefined;

          if (typeof filePath === 'string') {
            sandbox.files
              .read(filePath, { format: 'bytes' })
              .then((bytes) => {
                const name = nodePath.basename(filePath);
                const dest = nodePath.join(OUTPUT_DIR, name);
                fs.writeFileSync(dest, Buffer.from(bytes));
                logger.info({ dest }, '[sandbox-test] showFile: saved locally');
              })
              .catch((err: unknown) => {
                logger.warn(
                  { err, filePath },
                  '[sandbox-test] showFile: read failed'
                );
              });
          }
        }
      }

      if (event.type === 'message_update') {
        const { assistantMessageEvent } = event;
        if (
          assistantMessageEvent.type === 'text_delta' &&
          typeof assistantMessageEvent.delta === 'string'
        ) {
          process.stdout.write(assistantMessageEvent.delta);
        }
      }
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('[sandbox-test] Execution timed out')),
        config.runtime.executionTimeoutMs
      )
    );

    try {
      await runWithModelRetry({
        client,
        prompt: TEST_PROMPT,
        timeoutPromise,
        ctxId: 'sandbox-test',
        onModelSwitch: (attempt, total) => {
          logger.warn(
            { attempt, total },
            '[sandbox-test] Switching to fallback model'
          );
        },
      });
    } finally {
      unsubscribe();
    }

    process.stdout.write('\n');

    const response =
      (await client.getLastAssistantText().catch(() => null))?.trim() ??
      getResponse(events) ??
      'Done';

    logger.info({ response }, '[sandbox-test] Completed');
    logger.info(
      { dir: OUTPUT_DIR },
      '[sandbox-test] Files saved to output directory'
    );
  } finally {
    logger.info(
      { sandboxId: sandbox.sandboxId },
      '[sandbox-test] Killing sandbox'
    );
    await Sandbox.kill(sandbox.sandboxId, { apiKey: env.E2B_API_KEY }).catch(
      () => null
    );
  }
}

main().catch((error: unknown) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    '[sandbox-test] Failed'
  );
  process.exit(1);
});
