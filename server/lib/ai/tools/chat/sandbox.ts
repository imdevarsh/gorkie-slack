import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import {
  type PromptResourceLink,
  syncAttachments,
} from '~/lib/sandbox/attachments';
import { getResponse, subscribeEvents } from '~/lib/sandbox/events';
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

        const stream: unknown[] = [];
        const unsubscribe = subscribeEvents({
          client: runtime.client,
          runtime,
          context,
          ctxId,
          stream,
        });

        try {
          const idlePromise = runtime.client.waitForIdle();
          await runtime.client.prompt(promptText);
          await idlePromise;
        } finally {
          unsubscribe();
        }

        const response = getResponse(stream);

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
          await runtime.client.disconnect().catch((error: unknown) => {
            logger.debug(
              { error, ctxId },
              '[subagent] Failed to disconnect Pi client'
            );
          });
        }
      }
    },
  });
