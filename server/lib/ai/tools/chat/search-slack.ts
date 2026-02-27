import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import type { SlackMessageContext, SlackSearchResponse, Stream } from '~/types';
import { getContextId } from '~/utils/context';

function getActionToken(event: unknown): string | undefined {
  if (!event || typeof event !== 'object') {
    return undefined;
  }

  const assistantThread = (event as { assistant_thread?: unknown })
    .assistant_thread;
  if (!assistantThread || typeof assistantThread !== 'object') {
    return undefined;
  }

  const actionToken = (assistantThread as { action_token?: unknown })
    .action_token;
  return typeof actionToken === 'string' ? actionToken : undefined;
}

export const searchSlack = ({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
  tool({
    description: 'Use this to search the Slack workspace for information',
    inputSchema: z.object({
      query: z.string(),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Searching Slack',
        status: 'pending',
      });
    },
    execute: async ({ query }, { toolCallId }) => {
      const ctxId = getContextId(context);
      const actionToken = getActionToken(context.event);

      if (!actionToken) {
        const pingMessage =
          'The search could not be completed because the user did not explicitly ping/mention you in their message. Please ask the user to do so.';
        await finishTask(stream, {
          status: 'error',
          taskId: toolCallId,
          output: pingMessage,
        });
        return {
          success: false,
          error: pingMessage,
        };
      }

      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Searching Slack',
        details: query,
        status: 'in_progress',
      });

      const response = await fetch(
        'https://slack.com/api/assistant.search.context',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${context.client.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, action_token: actionToken }),
        }
      );

      const res = (await response.json()) as SlackSearchResponse;

      if (!(res.ok && res.results?.messages)) {
        const error = res.error ?? 'unknown';
        const isMissingActionToken = error
          .toLowerCase()
          .includes('action_token');

        logger.error({ ctxId, res }, 'Failed to search');

        if (isMissingActionToken) {
          const pingMessage =
            'The search could not be completed because the user did not explicitly ping/mention you in their message. Please ask the user to do so.';
          await finishTask(stream, {
            status: 'error',
            taskId: task,
            output: pingMessage,
          });
          return {
            success: false,
            error: pingMessage,
          };
        }

        await finishTask(stream, {
          status: 'error',
          taskId: task,
          output: `Search failed: ${error}`,
        });
        return {
          success: false,
          error: `The search failed with the error ${error}.`,
        };
      }

      logger.debug(
        { ctxId, query, count: res.results.messages.length },
        'Search Slack complete'
      );
      await finishTask(stream, {
        status: 'complete',
        taskId: task,
        output: `${(res.results?.messages ?? []).length} result(s)`,
      });
      return {
        messages: res.results.messages,
      };
    },
  });
