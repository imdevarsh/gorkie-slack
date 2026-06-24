import { tool } from 'ai';
import type { Message } from 'chat';
import { z } from 'zod';
import { slack } from '@/lib/chat';
import logger from '@/lib/logger';

const actionTokenSchema = z.looseObject({
  action_token: z.string().min(1).optional(),
  assistant_thread: z
    .object({ action_token: z.string().min(1).optional() })
    .optional(),
});

const contextMessageSchema = z
  .looseObject({
    text: z.string().optional(),
    ts: z.string().optional(),
    user_id: z.string().optional(),
  })
  .transform((message) => ({
    text: message.text ?? '',
    ts: message.ts,
    userId: message.user_id,
  }));

const slackSearchResponseSchema = z.looseObject({
  error: z.string().optional(),
  ok: z.boolean(),
  response_metadata: z
    .looseObject({ next_cursor: z.string().optional() })
    .optional(),
  results: z
    .looseObject({
      messages: z
        .array(
          z
            .looseObject({
              author_name: z.string().optional(),
              author_user_id: z.string().optional(),
              channel_id: z.string().optional(),
              channel_name: z.string().optional(),
              content: z.string().optional(),
              context_messages: z
                .looseObject({
                  after: z.array(contextMessageSchema).optional(),
                  before: z.array(contextMessageSchema).optional(),
                })
                .optional(),
              is_author_bot: z.boolean().optional(),
              message_ts: z.string().optional(),
              permalink: z.string().optional(),
              team_id: z.string().optional(),
            })
            .transform((message) => ({
              authorName: message.author_name,
              authorUserId: message.author_user_id,
              channelId: message.channel_id,
              channelName: message.channel_name,
              content: message.content ?? '',
              context: message.context_messages
                ? {
                    after: message.context_messages.after ?? [],
                    before: message.context_messages.before ?? [],
                  }
                : undefined,
              isAuthorBot: message.is_author_bot,
              messageTs: message.message_ts,
              permalink: message.permalink,
              teamId: message.team_id,
            }))
        )
        .optional(),
    })
    .optional(),
});

export function searchSlackTool({ message }: { message: Message }) {
  return tool({
    description:
      'Search Slack messages for past conversations, decisions, links, or context outside the current thread.',
    inputSchema: z.object({
      cursor: z
        .string()
        .min(1)
        .optional()
        .describe('Cursor from a previous Slack search result page.'),
      query: z.string().min(1).max(500),
    }),
    execute: async ({ cursor, query }) => {
      const parsedRaw = actionTokenSchema.safeParse(message.raw);
      const actionToken = parsedRaw.success
        ? (parsedRaw.data.action_token ??
          parsedRaw.data.assistant_thread?.action_token)
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
          content_types: ['messages'],
          cursor,
          include_context_messages: true,
          limit: 10,
          query,
        })
      );
      const messages = parsedResponse.results?.messages ?? [];
      const nextCursor =
        parsedResponse.response_metadata?.next_cursor || undefined;

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
        nextCursor,
        resultCount: messages.length,
        success: true,
        summary: `Slack search found ${messages.length} message${messages.length === 1 ? '' : 's'} for "${query}".`,
      };
    },
  });
}
