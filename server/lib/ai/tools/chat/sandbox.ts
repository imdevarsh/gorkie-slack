import { tool } from 'ai';
import { z } from 'zod';
import { sandboxAgent } from '~/lib/ai/agents/sandbox-agent';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { syncAttachments } from '~/lib/sandbox/attachments';
import { buildSandboxContext } from '~/lib/sandbox/context';
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

export const sandbox = ({
  context,
  files,
}: {
  context: SlackMessageContext;
  files?: SlackFile[];
}) =>
  tool({
    description:
      'Delegate execution-heavy tasks to persistent sandbox agent.',
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

        const { messages, requestHints } = await buildSandboxContext(
          context,
          runtime.sandbox
        );

        const agent = sandboxAgent({
          context,
          sandbox: runtime.sandbox,
          requestHints,
        });
        const result = await agent.generate({
          messages: [
            ...messages,
            {
              role: 'user',
              content: task,
            },
          ],
        });
        const response = result.text;

        logger.info(
          {
            ctxId,
            sandboxId: runtime.sandboxId,
            attachments: attachments.map((file) => file.path),
            task,
            response,
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
            task,
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
            '[sandbox] Failed to pause sandbox after task'
          );
        });
      }
    },
  });
