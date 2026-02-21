import { tool } from 'ai';
import { z } from 'zod';
import { sandboxAgent } from '~/lib/ai/agents/sandbox-agent';
import { createTask, finishTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import { syncAttachments } from '~/lib/sandbox/attachments';
import { buildSandboxContext } from '~/lib/sandbox/context';
import { ensureSandbox, pauseSandbox } from '~/lib/sandbox/runtime';
import type { SlackMessageContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import type { SlackFile } from '~/utils/images';

function _normalizeStatus(status: string): string {
  const trimmed = status.trim();
  const prefixed = trimmed.startsWith('is ') ? trimmed : `is ${trimmed}`;
  return prefixed.slice(0, 49);
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
    description: 'Delegate execution-heavy tasks to persistent sandbox agent.',
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

      const taskId = await createTask(stream, {
        title: 'Running sandbox',
        details: task,
      });

      try {
        const runtime = await ensureSandbox(context);
        sandboxId = runtime.sandboxId;

        const attachments = await syncAttachments(
          runtime.sandbox,
          context,
          files
        );

        const { messages, requestHints } = await buildSandboxContext(
          context,
          runtime.sandbox
        );

        const agent = sandboxAgent({
          context,
          sandbox: runtime.sandbox,
          requestHints,
          stream,
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
        await finishTask(
          stream,
          taskId,
          'complete',
          response.split('\n')[0]?.slice(0, 200) ?? 'Done'
        );
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
            sandboxId,
            task,
            message,
          },
          '[sandbox] Sandbox run failed'
        );
        await finishTask(stream, taskId, 'error', message.slice(0, 200));
        return {
          success: false,
          error: message,
        };
      } finally {
        await pauseSandbox(context).catch((error: unknown) => {
          logger.warn(
            {
              ...toLogError(error),
              ctxId,
              sandboxId,
            },
            '[sandbox] Failed to pause sandbox after task'
          );
        });
      }
    },
  });
