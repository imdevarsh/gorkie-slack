import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';

export const searchSlack = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Use this to search the Slack workspace for information',
    inputSchema: z.object({
      query: z.string(),
    }),
    execute: async ({ query }) => {
      await setStatus(context, { status: 'is searching Slack', loading: true });
      // biome-ignore lint/suspicious/noExplicitAny: manual API calls because Slack Bolt doesn't have support for this method yet
      const action_token = (context.event as any)?.assistant_thread
        ?.action_token;

      if (!action_token) {
        return {
          success: false,
          error:
            'The search could not be completed because the user did not explicitly ping/mention you in their message. Please ask the user to do so.',
        };
      }

      const res = (await (
        await fetch('https://slack.com/api/assistant.search.context', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${context.client.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            action_token,
          }),
        })
      )
        // biome-ignore lint/suspicious/noExplicitAny: see above
        .json()) as any;

      if (!(res.ok && res.results && res.results.messages)) {
        logger.error({ res }, 'Failed to search');
        return {
          success: false,
          error: `The search failed with the error ${res.error}.`,
        };
      }

      logger.debug(
        { query, count: res.results.messages.length },
        'Search Slack complete'
      );

      return {
        messages: res.results.messages,
      };
    },
  });
