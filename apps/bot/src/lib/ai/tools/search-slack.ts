import { tool } from 'ai';
import type { Message } from 'chat';
import { z } from 'zod';
import { slack } from '@/lib/chat';
import logger from '@/lib/logger';

const actionTokenSchema = z
  .object({
    assistant_thread: z
      .object({ action_token: z.string().min(1).optional() })
      .optional(),
  })
  .passthrough();

const slackSearchResponseSchema = z
  .object({
    error: z.string().optional(),
    ok: z.boolean(),
    results: z
      .object({
        messages: z.array(z.unknown()).optional(),
      })
      .optional(),
  })
  .passthrough();

export function searchSlack({ message }: { message: Message }) {
  return tool({
    description:
      'Search the Slack workspace for messages, files, or discussions. Use it for past conversations, decisions, files, links, or context outside the current thread.',
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(500)
        .describe(
          'Specific Slack search query with keywords, people, channels, or dates.'
        ),
    }),
    execute: async ({ query }) => {
      const parsedRaw = actionTokenSchema.safeParse(message.raw);
      const actionToken = parsedRaw.success
        ? parsedRaw.data.assistant_thread?.action_token
        : undefined;

      if (!actionToken) {
        return {
          error:
            'Slack search requires the user to explicitly ping/mention Gorkie so Slack provides an assistant search token.',
          success: false,
          summary:
            'Could not search Slack because this turn did not include an assistant search token. Ask the user to explicitly mention Gorkie.',
        };
      }

      const parsedResponse = slackSearchResponseSchema.parse(
        await slack.webClient.apiCall('assistant.search.context', {
          action_token: actionToken,
          query,
        })
      );
      const messages = parsedResponse.results?.messages ?? [];

      if (!parsedResponse.ok) {
        const error = parsedResponse.error ?? 'unknown';
        logger.warn({ error, query }, '[searchSlack] search failed');
        return {
          error: `Slack search failed: ${error}`,
          success: false,
          summary: `Slack search failed for "${query}": ${error}`,
        };
      }

      logger.debug({ count: messages.length, query }, '[searchSlack] complete');
      return {
        messages,
        resultCount: messages.length,
        success: true,
        summary: `Slack search found ${messages.length} result${messages.length === 1 ? '' : 's'} for "${query}".`,
      };
    },
  });
}
