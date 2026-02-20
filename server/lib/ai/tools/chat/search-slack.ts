import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

interface AssistantThreadEvent {
  assistant_thread?: { action_token?: string };
}

interface SlackSearchResponse {
  ok: boolean;
  error?: string;
  results?: {
    messages: unknown[];
  };
}

export const searchSlack = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Use this to search the Slack workspace for information',
    inputSchema: z.object({
      query: z.string(),
    }),
    execute: async ({ query }) => {
      const ctxId = getContextId(context);
      await setStatus(context, { status: 'is searching Slack', loading: true });
      const action_token = (context.event as AssistantThreadEvent)
        .assistant_thread?.action_token;

      if (!action_token) {
        return {
          success: false,
          error:
            'The search could not be completed because the user did not explicitly ping/mention you in their message. Please ask the user to do so.',
        };
      }

      const response = await fetch(
        'https://slack.com/api/assistant.search.context',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${context.client.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, action_token }),
        }
      );

      const res = (await response.json()) as SlackSearchResponse;

      if (!(res.ok && res.results?.messages)) {
        logger.error({ ctxId, res }, 'Failed to search');
        return {
          success: false,
          error: `The search failed with the error ${res.error}.`,
        };
      }

      logger.debug(
        { ctxId, query, count: res.results.messages.length },
        'Search Slack complete'
      );

      return {
        messages: res.results.messages,
      };
    },
  });
