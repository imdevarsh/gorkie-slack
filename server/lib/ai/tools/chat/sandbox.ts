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
import { errorMessage, toLogError } from '~/utils/error';
import type { SlackFile } from '~/utils/images';

function normalizeStatus(status: string): string {
  const trimmed = status.trim();
  const prefixed = trimmed.startsWith('is ') ? trimmed : `is ${trimmed}`;
  return prefixed.slice(0, 49);
}

export const sandbox = ({
  context,
  files,
}: {
  context: SlackMessageContext;
  files?: SlackFile[];
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
            ...toLogError(error),
            ctxId,
            sandboxId,
            task,
            message,
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
