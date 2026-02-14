import { tool } from 'ai';
import type { Session } from 'sandbox-agent';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import {
  type PromptResourceLink,
  syncAttachments,
} from '~/lib/sandbox/attachments';
import { uploadFiles } from '~/lib/sandbox/display';
import { resolveSession } from '~/lib/sandbox/session';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import type { SlackFile } from '~/utils/images';

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

function subscribeEvents(params: {
  session: Session;
  context: SlackMessageContext;
  ctxId: string;
  stream: unknown[];
}): () => void {
  const { session, context, ctxId, stream } = params;
  let lastStatus: string | null = null;

  return session.onEvent((event) => {

    const update =
      (
        event.payload as {
          params?: {
            update?: {
              sessionUpdate?: string;
              title?: string;
              rawInput?: { description?: string };
            };
          };
        }
      ).params?.update ?? null;

    if (update?.sessionUpdate?.endsWith('_chunk')) {
      return;
    }
    stream.push(event.payload);

    if (event.sender !== 'agent') {
      return;
    }
    const status = update?.rawInput?.description;
    if (typeof status === 'string' && status.trim().length > 0) {
      const nextStatus = status.trim().slice(0, 50);
      if (nextStatus !== lastStatus) {
        lastStatus = nextStatus;
        logger.info({ ctxId, status: nextStatus }, '[subagent] Status update');
        setStatus(context, {
          status: nextStatus,
          loading: true,
        }).catch((error: unknown) => {
          logger.debug({ error, ctxId }, '[subagent] Status update skipped');
        });
      }
    }
  });
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
            text: `${task}\n\nAt the end, provide a concise summary of what you changed and where outputs are located.`,
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
          await runtime.session.prompt([...prompt]);
        } finally {
          unsubscribe();
        }

        const summary = (() => {
          console.log(JSON.stringify(stream, null, 2));
          const last = stream.at(-2);

          if (last === undefined) {
            return 'Task completed in sandbox.';
          }

          logger.info(
            { ctxId, last },
            '[subagent] summary generated'
          );

          try {
            return JSON.stringify(last);
          } catch (error) {
            logger.debug({ error }, '[subagent] Failed to stringify last event');
            return 'Task completed in sandbox.';
          }
        })();

        await setStatus(context, {
          status: 'is collecting outputs',
          loading: true,
        });
        await uploadFiles(runtime, context);

        logger.info({ ctxId }, '[subagent] Sandbox run completed');

        return {
          success: true,
          summary,
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
