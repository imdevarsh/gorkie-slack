import { tool } from 'ai';
import PQueue from 'p-queue';
import { z } from 'zod';
import { sandbox as config } from '~/config';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import { syncAttachments } from '~/lib/sandbox/attachments';
import { getResponse, subscribeEvents } from '~/lib/sandbox/events';
import { resolveSession } from '~/lib/sandbox/session';
import { getToolTaskEnd, getToolTaskStart } from '~/lib/sandbox/tools';
import type { SlackMessageContext, Stream } from '~/types';
import type { AgentSessionEvent } from '~/types/sandbox/rpc';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import type { SlackFile } from '~/utils/images';

export const sandbox = ({
  context,
  files,
  stream,
}: {
  context: SlackMessageContext;
  files?: SlackFile[];
  stream: Stream;
}) =>
  tool({
    description:
      'Delegate a task to the sandbox runtime for code execution, file processing, or data analysis. The sandbox maintains persistent state across calls in this conversation, files, installed packages, written code, and previous results are all preserved. Reference prior work directly without re-explaining it.',
    inputSchema: z.object({
      task: z
        .string()
        .describe(
          'A clear description of what to accomplish. The sandbox remembers all previous work in this thread, files, code, and context from earlier runs are available. Reference them directly.'
        ),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Running sandbox',
        status: 'pending',
      });
    },
    execute: async ({ task }, { toolCallId }) => {
      const ctxId = getContextId(context);
      let runtime: Awaited<ReturnType<typeof resolveSession>> | null = null;
      const tasks = new Map<string, string>();
      const queue = new PQueue({ concurrency: 1 });
      const enqueue = (fn: () => Promise<unknown>) => {
        queue.add(fn).catch((error: unknown) => {
          logger.warn(
            { ...toLogError(error), ctxId },
            '[sandbox] Failed queued task update'
          );
        });
      };

      const taskId = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Running sandbox',
        details: task,
        status: 'in_progress',
      });

      try {
        runtime = await resolveSession(context);
        const uploads = await syncAttachments(runtime.sandbox, context, files);

        const prompt = `${task}${uploads.length > 0 ? `\n\n<files>\n${JSON.stringify(uploads, null, 2)}\n</files>` : ''}\n\nUpload results with showFile as soon as they are ready, do not wait until the end. End with a structured summary (Summary/Files/Notes).`;

        const eventStream: AgentSessionEvent[] = [];
        const unsubscribe = subscribeEvents({
          client: runtime.client,
          runtime,
          context,
          ctxId,
          events: eventStream,
          onRetry: ({ attempt, maxAttempts, delayMs }) => {
            const seconds = Math.round(delayMs / 1000);
            enqueue(() =>
              updateTask(stream, {
                taskId,
                status: 'in_progress',
                details: `Retrying... (${attempt}/${maxAttempts}, waiting ${seconds}s)`,
              })
            );
          },
          onToolStart: ({ toolName, toolCallId, args, status }) => {
            const toolTask = getToolTaskStart({ toolName, args, status });
            const id = `${taskId}:${toolCallId}`;
            tasks.set(toolCallId, id);
            enqueue(() =>
              createTask(stream, {
                taskId: id,
                title: toolTask.title,
                details: toolTask.details,
                status: 'in_progress',
              })
            );
          },
          onToolEnd: ({ toolName, toolCallId, isError, result }) => {
            const id = tasks.get(toolCallId);
            if (!id) {
              return;
            }
            tasks.delete(toolCallId);
            const { output } = getToolTaskEnd({ toolName, result, isError });
            enqueue(() =>
              finishTask(stream, {
                status: isError ? 'error' : 'complete',
                taskId: id,
                output,
              })
            );
          },
        });

        const keepAlive = setInterval(
          () => {
            enqueue(() =>
              updateTask(stream, { taskId, status: 'in_progress' })
            );
          },
          3 * 60 * 1000
        );

        try {
          const idle = runtime.client.waitForIdle();
          await runtime.client.prompt(prompt);
          await idle;
        } catch (error) {
          await runtime.client.abort().catch(() => null);
          throw error;
        } finally {
          clearInterval(keepAlive);
          unsubscribe();
        }

        await queue.onIdle();

        const response =
          (
            await runtime.client.getLastAssistantText().catch(() => null)
          )?.trim() ||
          getResponse(eventStream) ||
          'Done';

        logger.info(
          {
            ctxId,
            sandboxId: runtime.sandbox.sandboxId,
            attachments: uploads.map((f) => f.uri),
            task,
            response,
          },
          '[sandbox] Sandbox run completed'
        );

        await finishTask(stream, {
          status: 'complete',
          taskId,
          output: response,
        });

        return { success: true, response };
      } catch (error) {
        const message = errorMessage(error);

        logger.error(
          { ...toLogError(error), ctxId, task, message },
          '[sandbox] Sandbox run failed'
        );

        await finishTask(stream, {
          status: 'error',
          taskId,
          output: message.slice(0, 200),
        });

        return { success: false, error: message, task };
      } finally {
        if (runtime) {
          await runtime.client.disconnect().catch((e: unknown) => {
            logger.debug(
              { ...toLogError(e), ctxId },
              '[subagent] Failed to disconnect Pi client'
            );
          });
        }
      }
    },
  });
