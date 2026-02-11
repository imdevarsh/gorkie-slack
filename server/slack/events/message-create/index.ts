import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { messageThreshold } from '~/config';
import { env } from '~/env';
import { isUserAllowed } from '~/lib/allowed-users';
import { ratelimit, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import { getQueue } from '~/lib/queue';
import type { SlackMessageContext } from '~/types';
import { buildChatContext, getContextId } from '~/utils/context';
import { logReply } from '~/utils/log';
import {
  checkMessageQuota,
  resetMessageCount,
} from '~/utils/message-rate-limiter';
import { shouldUse } from '~/utils/messages';
import { getTrigger } from '~/utils/triggers';
import { generateResponse } from './utils/respond';

export const name = 'message';

type MessageEventArgs = SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs;

async function canReply(ctxId: string): Promise<boolean> {
  const { success } = await ratelimit(redisKeys.channelCount(ctxId));
  if (!success) {
    logger.info({ ctxId }, 'Rate limit hit. Skipping reply.');
  }
  return success;
}

async function onSuccess(_context: SlackMessageContext) {
  // await saveChatMemory(context, 5);
}

function isProcessableMessage(
  args: MessageEventArgs
): SlackMessageContext | null {
  const { event, context, client, body } = args;

  // has to be done again for type things
  if (
    event.subtype &&
    event.subtype !== 'thread_broadcast' &&
    event.subtype !== 'file_share'
  ) {
    return null;
  }

  if ('bot_id' in event && event.bot_id) {
    return null;
  }

  if (context.botUserId && event.user === context.botUserId) {
    return null;
  }

  if (!('text' in event)) {
    return null;
  }

  return {
    event: event as SlackMessageContext['event'],
    client,
    botUserId: context.botUserId,
    teamId:
      context.teamId ??
      (typeof body === 'object' && body
        ? (body as { team_id?: string }).team_id
        : undefined),
  } satisfies SlackMessageContext;
}

async function getAuthorName(
  ctx: SlackMessageContext,
  ctxId: string
): Promise<string> {
  const userId = (ctx.event as { user?: string }).user;
  if (!userId) {
    return 'unknown';
  }
  try {
    const info = await ctx.client.users.info({ user: userId });
    return (
      info.user?.profile?.display_name ||
      info.user?.real_name ||
      info.user?.name ||
      userId
    );
  } catch (error) {
    logger.warn(
      { error, userId, ctxId },
      'Failed to fetch user info for logging'
    );
    return userId;
  }
}

async function handleMessage(args: MessageEventArgs) {
  if (
    args.event.subtype &&
    args.event.subtype !== 'thread_broadcast' &&
    args.event.subtype !== 'file_share'
  ) {
    return;
  }

  if (!shouldUse(args.event.text || '')) {
    return;
  }

  const messageContext = isProcessableMessage(args);
  if (!messageContext) {
    return;
  }

  const ctxId = getContextId(messageContext);
  const trigger = await getTrigger(messageContext, messageContext.botUserId);

  const authorName = await getAuthorName(messageContext, ctxId);
  const content = (messageContext.event as { text?: string }).text ?? '';

  const { messages, requestHints } = await buildChatContext(messageContext);

  if (trigger.type) {
    if (!isUserAllowed(args.event.user)) {
      await args.client.chat.postMessage({
        channel: args.event.channel,
        thread_ts: args.event.thread_ts || args.event.ts,
        markdown_text: `Hey there <@${args.event.user}>! For security and privacy reasons, you must be in <#${env.OPT_IN_CHANNEL}> to talk to me. When you're ready, ping me again and we can talk!`,
      });
      return;
    }

    await resetMessageCount(ctxId);

    logger.info(
      {
        ctxId,
        message: `${authorName}: ${content}`,
      },
      `Triggered by ${trigger.type}`
    );

    const result = await generateResponse(
      messageContext,
      messages,
      requestHints
    );

    logReply(ctxId, authorName, result, 'trigger');

    if (result.success && result.toolCalls) {
      await onSuccess(messageContext);
    }
    return;
  }

  if (!isUserAllowed(args.event.user)) {
    return;
  }

  const { count: idleCount, hasQuota } = await checkMessageQuota(ctxId);

  if (!hasQuota) {
    logger.debug(
      { ctxId },
      `Quota exhausted (${idleCount}/${messageThreshold})`
    );
    return;
  }
}

export async function execute(args: MessageEventArgs) {
  if (
    args.event.subtype &&
    args.event.subtype !== 'thread_broadcast' &&
    args.event.subtype !== 'file_share'
  ) {
    return;
  }

  const messageContext = isProcessableMessage(args);
  if (!messageContext) {
    return;
  }

  const ctxId = getContextId(messageContext);
  if (!(await canReply(ctxId))) {
    return;
  }

  return await getQueue(ctxId).add(async () => handleMessage(args));
}
