import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import {
  type PromptResourceLink,
  syncAttachments,
} from '~/lib/sandbox/attachments';
import { getResponse, subscribeEvents } from '~/lib/sandbox/events';
import { resolveSession } from '~/lib/sandbox/session';
import type { SlackMessageContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import type { SlackFile } from '~/utils/images';

function resourceLinkToText(link: PromptResourceLink): string {
  const parts = [`File: ${link.name}`, `URI: ${link.uri}`];
  if (link.mimeType) {
    parts.push(`Type: ${link.mimeType}`);
  }
  return parts.join(', ');
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

      const taskId = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Running sandbox',
        details: task,
        status: 'in_progress',
      });

      try {
        await setStatus(context, {
          status: 'is delegating a task to the sandbox',
          loading: true,
        });

        runtime = await resolveSession(context);
        const resourceLinks = await syncAttachments(
          runtime.sandbox,
          context,
          files
        );

        await setStatus(context, {
          status: 'is working in the sandbox',
          loading: true,
        });

        const fileRefs = resourceLinks.map(resourceLinkToText).join('\n');
        const promptText = fileRefs
          ? `${task}\n\nAvailable files:\n${fileRefs}\n\nUpload results with showFile as soon as they are ready, do not wait until the end. End with a structured summary (Summary/Files/Notes).`
          : `${task}\n\nUpload results with showFile as soon as they are ready, do not wait until the end. End with a structured summary (Summary/Files/Notes).`;

        const eventStream: unknown[] = [];
        const unsubscribe = subscribeEvents({
          client: runtime.client,
          runtime,
          context,
          ctxId,
          stream: eventStream,
        });

        try {
          const idlePromise = runtime.client.waitForIdle();
          await runtime.client.prompt(promptText);
          await idlePromise;
        } finally {
          unsubscribe();
        }

        const response = getResponse(eventStream) ?? 'Done';

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
          output: response.split('\n')[0]?.slice(0, 200) ?? 'Done',
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
