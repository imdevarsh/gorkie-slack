import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import {
  type PromptResourceLink,
  syncAttachments,
} from '~/lib/sandbox/attachments';
import { uploadFiles } from '~/lib/sandbox/display';
import { getResponse, subscribeEvents } from '~/lib/sandbox/events';
import { resolveSession } from '~/lib/sandbox/session';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import type { SlackFile } from '~/utils/images';

const SECRET_EXFILTRATION_PATTERNS = [
  /\bprintenv\b/i,
  /\b(show|print|dump|read|cat|reveal|list)\s+(all\s+)?env(ironment)?\b/i,
  /\benvironment variables?\b/i,
  /\/proc\/\d+\/environ/i,
  /\/proc\/self\/environ/i,
  /\benviron\b/i,
  /\bapi[_ -]?key\b/i,
  /\btoken\b/i,
  /\bsecret\b/i,
  /\bcredential(s)?\b/i,
  /\bprivate[_ -]?key\b/i,
  /\baccess[_ -]?key\b/i,
  /\baws[_ -]?(secret|access)\b/i,
] as const;

function isSecretExfiltrationRequest(task: string): boolean {
  const normalized = task.trim();
  if (normalized.length === 0) {
    return false;
  }

  return SECRET_EXFILTRATION_PATTERNS.some((pattern) =>
    pattern.test(normalized)
  );
}

async function waitForStreamToSettle(
  stream: unknown[],
  startLength: number
): Promise<void> {
  const timeoutMs = 5 * 60_000;
  const idleMs = 6000;
  const pollMs = 300;
  const startedAt = Date.now();
  let lastGrowthAt = Date.now();
  let sawNewEvents = false;
  let knownLength = stream.length;

  while (Date.now() - startedAt < timeoutMs) {
    if (stream.length > knownLength) {
      knownLength = stream.length;
      lastGrowthAt = Date.now();
      sawNewEvents = stream.length > startLength;
    }

    if (sawNewEvents && Date.now() - lastGrowthAt >= idleMs) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, pollMs);
    });
  }

  throw new Error('Timed out waiting for sandbox agent response stream');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
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
      'Delegate a task to the sandbox runtime for code execution, file processing, or data analysis.',
    inputSchema: z.object({
      task: z
        .string()
        .describe(
          'A clear description of what to accomplish in the sandbox. Include file names, expected outputs, and any specific instructions.'
        ),
    }),
    execute: async ({ task }) => {
      if (isSecretExfiltrationRequest(task)) {
        return {
          success: false,
          error:
            'Refused: secret exfiltration requests are not allowed (environment variables, tokens, API keys, credentials, or /proc/*/environ).',
        };
      }

      await setStatus(context, {
        status: 'is delegating a task to the sandbox',
        loading: true,
      });

      const ctxId = getContextId(context);

      let runtime: Awaited<ReturnType<typeof resolveSession>> | null = null;

      try {
        runtime = await resolveSession(context);
        const resourceLinks = await syncAttachments(
          runtime.sdk,
          context,
          files
        );

        await setStatus(context, {
          status: 'is working in the sandbox',
          loading: true,
        });

        const prompt = [
          {
            type: 'text' as const,
            text: `${task}\n\nAt the end, provide a detailed summary, as well as any relevant files as attachments. Files are NOT shown to the user, unless put inside the \`output/display\` folder.`,
          },
          ...resourceLinks,
        ] satisfies Array<{ type: 'text'; text: string } | PromptResourceLink>;

        const stream: unknown[] = [];
        const unsubscribe = subscribeEvents({
          session: runtime.session,
          context,
          ctxId,
          stream,
        });

        try {
          const streamStartLength = stream.length;
          await runtime.session.send(
            'session/prompt',
            { prompt: [...prompt] },
            { notification: true }
          );
          await waitForStreamToSettle(stream, streamStartLength);
        } finally {
          unsubscribe();
        }

        const response = getResponse(stream);
        await setStatus(context, {
          status: 'is collecting outputs',
          loading: true,
        });
        await uploadFiles(runtime, context);

        logger.info({ ctxId, response }, '[subagent] Sandbox run completed');

        return {
          success: true,
          response,
        };
      } catch (error) {
        const message = errorMessage(error);
        logger.error(
          {
            error,
            errorMessage: message,
            errorName: error instanceof Error ? error.name : undefined,
            ctxId,
          },
          '[subagent] Sandbox run failed'
        );
        return {
          success: false,
          error: message,
        };
      } finally {
        if (runtime) {
          await runtime.sdk.dispose().catch((error: unknown) => {
            logger.debug(
              { error, ctxId },
              '[subagent] Failed to dispose sandbox SDK client'
            );
          });
        }
      }
    },
  });
