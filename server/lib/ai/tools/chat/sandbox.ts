import { tool } from 'ai';
import { z } from 'zod';
import { sandboxAgent } from '~/lib/ai/agents';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { buildSandboxContext, getSandbox } from '~/lib/sandbox';
import { syncAttachments } from '~/lib/sandbox/attachments';
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
        const instance = await getSandbox(context);
        await syncAttachments(instance, context, files);

        const { messages, requestHints } = await buildSandboxContext(context);

        const agent = sandboxAgent({ context, requestHints });
        const result = await agent.generate({
          messages: [...messages, { role: 'user', content: task }],
        });

        logger.info(
          { steps: result.steps.length, ctxId },
          '[subagent] [sandbox] completed'
        );

        return {
          success: true,
          summary: result.text || 'Task completed.',
          steps: result.steps.length,
        };
      } catch (error) {
        logger.error({ error, ctxId }, '[subagent] [sandbox] failed');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
