import { tool } from 'ai';
import { z } from 'zod';
import { sandboxAgent } from '~/lib/ai/agents/sandbox-agent';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { syncAttachments } from '~/lib/sandbox/attachments';
import { ensureSandbox } from '~/lib/sandbox/runtime';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import type { SlackFile } from '~/utils/images';

function normalizeStatus(status: string): string {
  const trimmed = status.trim();
  const prefixed = trimmed.startsWith('is ') ? trimmed : `is ${trimmed}`;
  return prefixed.slice(0, 49);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
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
      'Delegate execution-heavy tasks to persistent E2B sandbox agent.',
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

      await setStatus(context, {
        status: normalizeStatus('is delegating to sandbox'),
        loading: true,
      });

      try {
        const runtime = await ensureSandbox(context);

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

        const agent = sandboxAgent({
          context,
          sandbox: runtime.sandbox,
        });
        const result = await agent.generate({
          prompt: [
            'Complete this sandbox task:',
            task,
            '',
            'Attachments available in sandbox:',
            attachments.length > 0
              ? attachments
                  .map(
                    (file) =>
                      `- ${file.path}${file.mimeType ? ` (${file.mimeType})` : ''}`
                  )
                  .join('\n')
              : '- none',
            '',
            'Important: call showFile for every artifact that should be uploaded to Slack.',
          ].join('\n'),
        });
        const response = result.text;

        logger.info(
          {
            ctxId,
            sandboxId: runtime.sandboxId,
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
            error,
            ctxId,
          },
          '[sandbox] Sandbox run failed'
        );

        return {
          success: false,
          error: message,
        };
      }
    },
  });
