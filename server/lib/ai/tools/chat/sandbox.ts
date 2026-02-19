import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import {
  type PromptResourceLink,
  syncAttachments,
} from '~/lib/sandbox/attachments';
import {
  getResponse,
  type SandboxTaskUpdate,
  subscribeEvents,
} from '~/lib/sandbox/events';
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

type SlackChunk =
  | {
      type: 'markdown_text';
      text: string;
    }
  | {
      type: 'task_update';
      id: string;
      title: string;
      status: 'pending' | 'in_progress' | 'complete' | 'error';
      details?: string;
      output?: string;
    }
  | {
      type: 'plan_update';
      title: string;
    };

interface SlackPlanStream {
  append: (chunks: SlackChunk[]) => Promise<void>;
  stop: (chunks: SlackChunk[]) => Promise<void>;
}

async function createPlanStream(
  context: SlackMessageContext
): Promise<SlackPlanStream | null> {
  const channel = (context.event as { channel?: string }).channel;
  const userId = (context.event as { user?: string }).user;
  const teamId = context.teamId;
  const threadTs =
    (context.event as { thread_ts?: string }).thread_ts ?? context.event.ts;

  if (!(channel && threadTs)) {
    return null;
  }

  const started = await context.client
    .apiCall('chat.startStream', {
      channel,
      thread_ts: threadTs,
      task_display_mode: 'plan',
      ...(userId && teamId
        ? {
            recipient_user_id: userId,
            recipient_team_id: teamId,
          }
        : {}),
    })
    .catch((error: unknown) => {
      logger.debug(
        { error, channel, threadTs },
        '[sandbox] startStream failed'
      );
      return null;
    });

  const streamTs =
    started &&
    typeof started === 'object' &&
    typeof (started as { ts?: unknown }).ts === 'string'
      ? (started as unknown as { ts: string }).ts
      : null;

  if (!streamTs) {
    return null;
  }

  let queue = Promise.resolve();
  const enqueue = (fn: () => Promise<void>): Promise<void> => {
    queue = queue.then(fn).catch((error: unknown) => {
      logger.debug(
        { error, channel, streamTs },
        '[sandbox] stream update failed'
      );
    });
    return queue;
  };

  return {
    append: (chunks) =>
      enqueue(async () => {
        await context.client.apiCall('chat.appendStream', {
          channel,
          ts: streamTs,
          chunks,
        });
      }),
    stop: (chunks) =>
      enqueue(async () => {
        await context.client.apiCall('chat.stopStream', {
          channel,
          ts: streamTs,
          chunks,
        });
      }),
  };
}

function taskToChunk(task: SandboxTaskUpdate): SlackChunk {
  return {
    type: 'task_update',
    id: task.taskId,
    title: task.title,
    status: task.status,
    ...(task.details ? { details: task.details } : {}),
    ...(task.output ? { output: task.output } : {}),
  };
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
      let planStream: SlackPlanStream | null = null;
      const taskStatusById = new Map<string, SandboxTaskUpdate['status']>();

      try {
        runtime = await resolveSession(context);
        planStream = await createPlanStream(context);
        if (planStream) {
          await planStream.append([
            { type: 'plan_update', title: 'Working in sandbox' },
          ]);
        }
        const resourceLinks = await syncAttachments(
          runtime.sandbox,
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
            text: `${task}\n\nUpload results with showFile as soon as they are ready, do not wait until the end. End with a structured summary (Summary/Files/Notes).`,
          },
          ...resourceLinks,
        ] satisfies Array<{ type: 'text'; text: string } | PromptResourceLink>;

        const stream: unknown[] = [];
        const unsubscribe = subscribeEvents({
          session: runtime.session,
          runtime,
          context,
          ctxId,
          stream,
          onTaskUpdate: (taskUpdate) => {
            const previousStatus = taskStatusById.get(taskUpdate.taskId);
            if (previousStatus === taskUpdate.status) {
              return;
            }
            taskStatusById.set(taskUpdate.taskId, taskUpdate.status);

            if (!planStream) {
              return;
            }
            const appendPromise = planStream.append([taskToChunk(taskUpdate)]);
            appendPromise.catch((error: unknown) => {
              logger.debug({ error, ctxId }, '[sandbox] plan append failed');
            });
          },
        });

        try {
          await runtime.session.prompt([...prompt]);
        } finally {
          unsubscribe();
        }

        const response = getResponse(stream);
        if (planStream) {
          await planStream.stop([
            { type: 'plan_update', title: 'Sandbox task completed' },
            ...(response
              ? [{ type: 'markdown_text' as const, text: response }]
              : []),
          ]);
          planStream = null;
        }

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
        if (planStream) {
          await planStream
            .stop([{ type: 'plan_update', title: 'Sandbox stream closed' }])
            .catch(() => undefined);
        }
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
