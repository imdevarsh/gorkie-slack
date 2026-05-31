import { toLogError } from '@repo/utils/error';
import { env } from '@/env';
import { isUserAllowed } from '@/lib/allowed-users';
import logger from '@/lib/logger';
import { getQueue } from '@/lib/queue';
import type { MessageEventArgs } from '@/types';
import { buildChatContext, getContextId } from '@/utils/context';
import { handleInlineCommand } from '@/utils/inline-commands';
import { logReply } from '@/utils/log';
import { getTrigger } from '@/utils/triggers';
import {
  getAuthorName,
  hasSupportedSubtype,
  shouldHandleMessage,
  toMessageContext,
} from './utils/message-context';
import { generateResponse } from './utils/respond';

export const name = 'message';

async function handleMessage(
  messageContext: NonNullable<ReturnType<typeof toMessageContext>>,
  trigger: Awaited<ReturnType<typeof getTrigger>>
) {
  const event = messageContext.event;
  if (!shouldHandleMessage(event)) {
    return;
  }
  const { user: userId, text: messageText = '' } = event;

  const ctxId = getContextId(messageContext);
  const authorName = await getAuthorName(messageContext);
  const content = messageText;

  const { messages, requestHints } = await buildChatContext(messageContext);

  if (trigger.type) {
    if (!isUserAllowed(userId)) {
      if (!event.channel) {
        return;
      }

      await messageContext.client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts ?? event.ts,
        markdown_text: `Hey there <@${userId}>! For security and privacy reasons, you must be in <#${env.OPT_IN_CHANNEL}> to talk to me. When you're ready, ping me again and we can talk!`,
      });
      return;
    }

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

    if (!result.success && result.error && event.channel) {
      await messageContext.client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts ?? event.ts,
        text: result.error,
      });
    }

    if (
      result.success &&
      requestHints.customization?.prompt &&
      event.channel &&
      event.channel_type !== 'im'
    ) {
      await messageContext.client.chat
        .postMessage({
          channel: event.channel,
          thread_ts: event.thread_ts ?? event.ts,
          blocks: [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: "_Gorkie's responses are shaped by this user's personal instructions_",
                },
              ],
            },
          ],
          text: "Gorkie's responses are shaped by this user's personal instructions",
        })
        .catch(() => null);
    }

    logReply({ ctxId, author: authorName, result, reason: 'trigger' });
    return;
  }

  if (!isUserAllowed(userId)) {
    return;
  }
}

export async function execute(args: MessageEventArgs): Promise<void> {
  if (!hasSupportedSubtype(args)) {
    return;
  }

  const messageContext = toMessageContext(args);
  if (!messageContext) {
    return;
  }

  const ctxId = getContextId(messageContext);
  const trigger = await getTrigger(messageContext, messageContext.botUserId);

  if (trigger.type === 'ping' || trigger.type === 'dm') {
    const raw = messageContext.event.text ?? '';
    const text =
      trigger.type === 'ping'
        ? raw.replace(/<@[A-Z0-9]+>/gi, '').trimStart()
        : raw;
    const inlineResult = await handleInlineCommand(messageContext, ctxId, text);
    if (inlineResult === 'handled') {
      return;
    }
  }

  await getQueue(ctxId)
    .add(async () => handleMessage(messageContext, trigger))
    .catch((error: unknown) => {
      logger.error(
        { ...toLogError(error), ctxId },
        'Failed to process queued message'
      );
    });
}
