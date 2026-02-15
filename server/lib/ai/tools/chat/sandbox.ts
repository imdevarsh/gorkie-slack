import { tool } from 'ai';
import { z } from 'zod';
import { sandbox as sandboxConfig } from '~/config';
import { sandboxAgent } from '~/lib/ai/agents/sandbox-agent';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { syncAttachments } from '~/lib/sandbox/attachments';
import { ensureSandbox, pauseSandbox } from '~/lib/sandbox/runtime';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import type { SlackFile } from '~/utils/images';

function normalizeStatus(status: string): string {
  const trimmed = status.trim();
  const prefixed = trimmed.startsWith('is ') ? trimmed : `is ${trimmed}`;
  return prefixed.slice(0, 49);
}

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const cause = (error as { cause?: { code?: string; message?: string } })
      .cause;
    const code = cause?.code;
    const causeMessage = cause?.message ?? '';

    if (
      code === '42703' &&
      typeof causeMessage === 'string' &&
      causeMessage.includes('sandbox_sessions')
    ) {
      return 'Sandbox DB schema is outdated. Run `bun run db:push` and restart the bot.';
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return String(error);
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        typeof error.cause === 'object' && error.cause !== null
          ? error.cause
          : (error.cause ?? null),
    };
  }

  if (typeof error === 'object' && error !== null) {
    return error as Record<string, unknown>;
  }

  return { error: String(error) };
}

async function extendTimeout(
  sandbox: Awaited<ReturnType<typeof ensureSandbox>>['sandbox']
): Promise<void> {
  try {
    const info = await sandbox.getInfo();
    const endAtMs =
      info.endAt instanceof Date
        ? info.endAt.getTime()
        : new Date(String(info.endAt)).getTime();
    const remainingMs = Number.isFinite(endAtMs) ? endAtMs - Date.now() : 0;

    if (remainingMs >= sandboxConfig.commandTimeoutMs) {
      return;
    }

    await sandbox.setTimeout(sandboxConfig.timeoutMs);
  } catch (error) {
    logger.warn(
      { error },
      '[sandbox] Failed to extend sandbox timeout before task step'
    );
  }
}

export const sandbox = ({
  context,
  files,
}: {
  context: SlackMessageContext;
  files?: SlackFile[];
}) =>
  tool({
    description:
      'Delegate execution-heavy tasks to persistent E2B sandbox agent.',
    inputSchema: z.object({
      task: z
        .string()
        .min(1)
        .describe(
          'Clear sandbox task with expected outputs and constraints. Mention exact filenames when possible.'
        ),
    }),
    execute: async ({ task }) => {
      const ctxId = getContextId(context);
      let sandboxId: string | null = null;

      await setStatus(context, {
        status: normalizeStatus('is delegating to sandbox'),
        loading: true,
      });

      try {
        const runtime = await ensureSandbox(context);
        sandboxId = runtime.sandboxId;
        await extendTimeout(runtime.sandbox);

        await setStatus(context, {
          status: normalizeStatus('is syncing attachments'),
          loading: true,
        });

        const attachments = await syncAttachments(
          runtime.sandbox,
          context,
          files
        );

        await setStatus(context, {
          status: normalizeStatus('is running sandbox steps'),
          loading: true,
        });
        await extendTimeout(runtime.sandbox);

        const agent = sandboxAgent({
          context,
          sandbox: runtime.sandbox,
        });
        const result = await agent.generate({
          prompt: [
            'Complete this sandbox task:',
            task,
            '',
            'Attachments available in sandbox:',
            attachments.length > 0
              ? attachments
                  .map(
                    (file) =>
                      `- ${file.path}${file.mimeType ? ` (${file.mimeType})` : ''}`
                  )
                  .join('\n')
              : '- none',
            '',
            'Important: call showFile for every artifact that should be uploaded to Slack.',
          ].join('\n'),
        });
        const response = result.text;

        logger.info(
          {
            ctxId,
            sandboxId: runtime.sandboxId,
            taskPreview: task.slice(0, 220),
            attachments: attachments.map((file) => file.path),
            responsePreview: response.slice(0, 400),
          },
          '[sandbox] Sandbox run completed'
        );

        return {
          success: true,
          response,
        };
      } catch (error) {
        const message = errorMessage(error);
        logger.error(
          {
            error: errorDetails(error),
            ctxId,
            taskPreview: task.slice(0, 220),
          },
          '[sandbox] Sandbox run failed'
        );

        return {
          success: false,
          error: message,
        };
      } finally {
        await pauseSandbox(context).catch((error: unknown) => {
          logger.warn(
            {
              error,
              ctxId,
              sandboxId,
            },
            '[sandbox] Failed to pause E2B sandbox after task'
          );
        });
      }
    },
  });
