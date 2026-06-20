import { tool } from 'ai';
import { z } from 'zod';
import logger from '@/lib/logger';

export function skipTool({ threadId }: { threadId: string }) {
  return tool({
    description:
      'End the turn without replying. Use when the message needs no response from you, for example when it is not addressed to you or is conversation between other people.',
    inputSchema: z.object({
      reason: z
        .string()
        .optional()
        .describe('Optional short reason for skipping.'),
    }),
    execute: ({ reason }) => {
      logger.info({ reason, threadId }, '[agent] skipped reply');
      return { skipped: true };
    },
  });
}
