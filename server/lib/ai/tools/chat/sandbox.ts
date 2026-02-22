import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import { syncAttachments } from '~/lib/sandbox/attachments';
import { getResponse, subscribeEvents } from '~/lib/sandbox/events';
import { resolveSession } from '~/lib/sandbox/session';
import { getToolTaskEnd, getToolTaskStart } from '~/lib/sandbox/tools';
import type { SlackMessageContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import type { SlackFile } from '~/utils/images';

interface ToolRunState {
  args: unknown;
  taskId: string;
}

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
      'Delegate a task to the sandbox runtime for code execution, file processing, or data analysis.',
    inputSchema: z.object({
      task: z
        .string()
        .describe(
          'A clear description of what to accomplish in the sandbox. Include file names, expected outputs, and any specific instructions.'
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
      const toolRuns = new Map<string, ToolRunState>();

      const taskId = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Running sandbox',
        details: task,
        status: 'in_progress',
      });

      try {
        runtime = await resolveSession(context);
        const resourceLinks = await syncAttachments(
          runtime.sandbox,
          context,
          files
        );

        const hasFiles = resourceLinks.length > 0;
        const filesJson = JSON.stringify(resourceLinks, null, 2);
        const promptText = hasFiles
          ? `${task}\n\n<files>\n${filesJson}\n</files>\n\nUpload results with showFile as soon as they are ready, do not wait until the end. End with a structured summary (Summary/Files/Notes).`
          : `${task}\n\nUpload results with showFile as soon as they are ready, do not wait until the end. End with a structured summary (Summary/Files/Notes).`;

        const eventStream: unknown[] = [];
        const unsubscribe = subscribeEvents({
          client: runtime.client,
          runtime,
          context,
          ctxId,
          stream: eventStream,
          onToolStart: async ({ toolName, toolCallId, args, status }) => {
            const toolTask = getToolTaskStart({
              toolName,
              args,
              status,
            });
            const toolTaskId = `${taskId}:${toolCallId}`;
            toolRuns.set(toolCallId, {
              taskId: toolTaskId,
              args,
            });

            await createTask(stream, {
              taskId: toolTaskId,
              title: toolTask.title,
              details: toolTask.details,
              status: 'in_progress',
            });
          },
          onToolEnd: async ({ toolName, toolCallId, isError, result }) => {
            const toolRun = toolRuns.get(toolCallId);
            if (!toolRun) {
              return;
            }
            toolRuns.delete(toolCallId);

            const toolResult = getToolTaskEnd({
              toolName,
              args: toolRun.args,
              result,
              isError,
            });

            await finishTask(stream, {
              status: isError ? 'error' : 'complete',
              taskId: toolRun.taskId,
              output: toolResult.output,
            });
          },
        });

        try {
          // Start waiting before prompting so we don't miss a fast `agent_end` event.
          const idle = runtime.client.waitForIdle();
          await runtime.client.prompt(promptText);
          await idle;
        } finally {
          unsubscribe();
        }

        const streamResponse = getResponse(eventStream);
        const lastAssistantMessage = await runtime.client
          .getLastAssistantText()
          .catch(() => null);
        const response = lastAssistantMessage?.trim() || streamResponse || 'Done';

        logger.info(
          {
            ctxId,
            sandboxId: runtime.sandbox.id,
            attachments: resourceLinks.map((file) => file.uri),
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

        return {
          success: true,
          response,
        };
      } catch (error) {
        const message = errorMessage(error);

        logger.error(
          {
            ...toLogError(error),
            ctxId,
            task,
            message,
          },
          '[sandbox] Sandbox run failed'
        );

        await finishTask(stream, {
          status: 'error',
          taskId,
          output: message.slice(0, 200),
        });

        return {
          success: false,
          error: message,
        };
      } finally {
        if (runtime) {
          await runtime.client.disconnect().catch((disconnectError: unknown) => {
            logger.debug(
              { ...toLogError(disconnectError), ctxId },
              '[subagent] Failed to disconnect Pi client'
            );
          });
        }
      }
    },
  });
