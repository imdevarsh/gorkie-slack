import { provider } from '@repo/ai';
import { generateText, tool } from 'ai';
import type { Chat } from 'chat';
import { z } from 'zod';
import { env } from '@/env';
import logger from '@/lib/logger';

export function summarizeThreadTool({
  bot,
  threadId,
}: {
  bot: Chat;
  threadId: string;
}) {
  return tool({
    description: 'Summarize a conversation thread.',
    inputSchema: z.object({
      instructions: z
        .string()
        .optional()
        .describe('Optional focus or format instructions for the summary.'),
      threadId: z
        .string()
        .optional()
        .describe(
          'Full Chat SDK thread id, e.g. slack:C123456:1781599802.270109. Defaults to the current thread.'
        ),
    }),
    execute: async (input) => {
      const targetThreadId = input.threadId ?? threadId;
      const [platform, channelId] = targetThreadId.split(':');
      if (platform === 'slack' && channelId) {
        await fetch('https://slack.com/api/conversations.join', {
          body: JSON.stringify({ channel: channelId }),
          headers: {
            Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }).catch((error: unknown) => {
          logger.debug(
            { err: error, threadId: targetThreadId },
            '[summarizeThread] best-effort channel join failed'
          );
        });
      }
      const result = await bot
        .thread(targetThreadId)
        .adapter.fetchMessages(targetThreadId, {
          direction: 'backward',
          limit: 100,
        });
      if (result.messages.length === 0) {
        return { error: 'No messages found in the thread.', success: false };
      }

      const transcript = result.messages
        .map((message) => {
          const author = message.author.fullName || message.author.userName;
          return `${author}: ${message.text}`;
        })
        .join('\n');
      const { text } = await generateText({
        model: provider.languageModel('chat-model'),
        prompt: `${input.instructions ? `${input.instructions}\n\n` : ''}Summarize this thread clearly and concisely. Preserve decisions, open questions, and action items when present.\n\n${transcript}`,
      });

      return {
        messageCount: result.messages.length,
        success: true,
        actionSummary: `Summarized ${result.messages.length} message${result.messages.length === 1 ? '' : 's'} from ${targetThreadId}.`,
        summary: text,
      };
    },
  });
}
