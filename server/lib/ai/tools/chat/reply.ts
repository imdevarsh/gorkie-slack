import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import type { SlackHistoryMessage, SlackMessageContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import { getSlackUserName } from '~/utils/users';

async function resolveTargetMessage(
  ctx: SlackMessageContext,
  offset: number,
  ctxId: string
): Promise<SlackHistoryMessage | null> {
  const channelId = ctx.event.channel;
  const messageTs = ctx.event.ts;

  if (!(channelId && messageTs)) {
    return null;
  }

  if (offset <= 0) {
    return {
      ts: messageTs,
      thread_ts: ctx.event.thread_ts,
    };
  }

  const history = await ctx.client.conversations.history({
    channel: channelId,
    latest: messageTs,
    inclusive: false,
    limit: offset,
  });

  if (!history.messages) {
    logger.error({ ctxId, res: history }, 'Error fetching history');
  }

  const sorted: SlackHistoryMessage[] = (history.messages ?? [])
    .filter(
      (msg): msg is { thread_ts?: string; ts: string } =>
        typeof msg.ts === 'string'
    )
    .sort((a, b) => Number(b.ts) - Number(a.ts))
    .map((msg) => ({
      ts: msg.ts,
      thread_ts: msg.thread_ts,
    }));

  return sorted[offset - 1] ?? { ts: messageTs };
}

function resolveThreadTs(
  target: SlackHistoryMessage | null,
  fallback?: string
) {
  if (target?.thread_ts) {
    return target.thread_ts;
  }
  if (target?.ts) {
    return target.ts;
  }
  if (fallback) {
    return fallback;
  }
  return undefined;
}

export const reply = ({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
  tool({
    description:
      'Send messages to the Slack channel. Use type "reply" to respond in a thread or "message" for the main channel.',
    inputSchema: z.object({
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          `Number of messages to go back from the triggering message. 0 or omitted means that you will reply to the message that you were triggered by. This would usually stay as 0. ${context.event.thread_ts ? 'NOTE: YOU ARE IN A THREAD - THE OFFSET WILL RESPOND TO A DIFFERENT THREAD. Change the offset only if you are sure.' : ''}`.trim()
        ),
      content: z
        .array(z.string())
        .nonempty()
        .describe('An array of lines of text to send. Send at most 4 lines.')
        .max(4),
      type: z
        .enum(['reply', 'message'])
        .default('reply')
        .describe('Reply in a thread or post directly in the channel.'),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Sending reply',
        status: 'pending',
      });
    },
    execute: async ({ offset = 0, content, type }, { toolCallId }) => {
      const ctxId = getContextId(context);
      const channelId = context.event.channel;
      const messageTs = context.event.ts;
      const currentThread = context.event.thread_ts;
      const userId = context.event.user;

      if (!(channelId && messageTs)) {
        logger.warn(
          { ctxId, channel: channelId, messageTs, type, offset },
          'Failed to send Slack reply: missing channel or timestamp'
        );
        return { success: false, error: 'Missing Slack channel or timestamp' };
      }

      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Sending reply',
        details: content[0],
        status: 'in_progress',
      });

      try {
        const target = await resolveTargetMessage(context, offset, ctxId);
        const threadTs =
          type === 'reply'
            ? resolveThreadTs(target, currentThread ?? messageTs)
            : undefined;

        for (const text of content) {
          await context.client.chat.postMessage({
            channel: channelId,
            text,
            thread_ts: threadTs,
          });
        }

        const authorName = userId
          ? await getSlackUserName(context.client, userId)
          : 'unknown';

        logger.info(
          {
            ctxId,
            channel: channelId,
            offset,
            type,
            author: authorName,
            content,
          },
          'Sent Slack reply'
        );
        await finishTask(stream, {
          status: 'complete',
          taskId: task,
          output: `Sent ${content.length} message(s)`,
        });
        return {
          success: true,
          content: 'Sent reply to Slack channel',
        };
      } catch (error) {
        logger.error(
          { ...toLogError(error), ctxId, channel: channelId, type, offset },
          'Failed to send Slack reply'
        );
        await finishTask(stream, {
          status: 'error',
          taskId: task,
          output: errorMessage(error),
        });
        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
