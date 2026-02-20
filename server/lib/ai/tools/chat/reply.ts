import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import { getSlackUserName } from '~/utils/users';

interface SlackHistoryMessage {
  ts?: string;
  thread_ts?: string;
}

async function resolveTargetMessage(
  ctx: SlackMessageContext,
  offset: number,
  ctxId: string
): Promise<SlackHistoryMessage | null> {
  const channelId = (ctx.event as { channel?: string }).channel;
  const messageTs = ctx.event.ts;

  if (!(channelId && messageTs)) {
    return null;
  }

  if (offset <= 0) {
    return {
      ts: messageTs,
      thread_ts: (ctx.event as { thread_ts?: string }).thread_ts,
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

  // TODO: Integrate shouldUse with this to prevent offset mismatches
  const sorted = (history.messages ?? [])
    .filter((msg) => Boolean(msg.ts))
    .sort((a, b) => Number(b.ts ?? '0') - Number(a.ts ?? '0'));

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

export const reply = ({ context }: { context: SlackMessageContext }) =>
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
          `Number of messages to go back from the triggering message. 0 or omitted means that you will reply to the message that you were triggered by. This would usually stay as 0. ${(context.event as { thread_ts?: string }).thread_ts ? 'NOTE: YOU ARE IN A THREAD - THE OFFSET WILL RESPOND TO A DIFFERENT THREAD. Change the offset only if you are sure.' : ''}`.trim()
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
    execute: async ({ offset = 0, content, type }) => {
      const ctxId = getContextId(context);
      const channelId = (context.event as { channel?: string }).channel;
      const messageTs = context.event.ts;
      const currentThread = (context.event as { thread_ts?: string }).thread_ts;
      const userId = (context.event as { user?: string }).user;

      if (!(channelId && messageTs)) {
        logger.warn(
          { ctxId, channel: channelId, messageTs, type, offset },
          'Failed to send Slack reply: missing channel or timestamp'
        );
        return { success: false, error: 'Missing Slack channel or timestamp' };
      }

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

        return {
          success: true,
          content: 'Sent reply to Slack channel',
        };
      } catch (error) {
        logger.error(
          { ...toLogError(error), ctxId, channel: channelId, type, offset },
          'Failed to send Slack reply'
        );
        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
