import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { sandboxRuntimeManager } from '~/lib/runtime/sandbox-runtime-manager';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import type { SlackFile } from '~/utils/images';

export const sandbox = ({
  context,
  files,
}: {
  context: SlackMessageContext;
  files?: SlackFile[];
}) =>
  tool({
    description:
      'Delegate a task to the sandbox agent for code execution, file processing, or data analysis.',
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

      try {
        const result = await sandboxRuntimeManager.sendTask(context, task, files);
        logger.info({ ctxId, sessionId: result.sessionId }, 'Sandbox run completed');

        return {
          success: true,
          summary: result.summary || 'Task completed.',
          status: result.status,
          sessionId: result.sessionId,
          fullOutputPath: result.fullOutputPath,
        };
      } catch (error) {
        logger.error({ error, ctxId }, '[subagent] Sandbox run failed');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
