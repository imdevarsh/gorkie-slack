import { env } from '~/env';
import { consentFallbackModel } from '~/lib/ai/providers';
import logger from '~/lib/logger';
import { getQueue } from '~/lib/queue';
import type { MessageEventArgs } from '~/types';
import { buildChatContext, getContextId } from '~/utils/context';
import { toLogError } from '~/utils/error';
import { logReply } from '~/utils/log';
import { getTrigger } from '~/utils/triggers';
import {
  canUseBot,
  getAuthorName,
  hasSupportedSubtype,
  shouldHandleMessage,
  toMessageContext,
} from './utils/message-context';
import { generateResponse } from './utils/respond';

export const name = 'message';

const RETRY_TRIGGER_PATTERN = /\B!retry\b/i;

function parseRetryMessage(messageText: string) {
  if (!RETRY_TRIGGER_PATTERN.test(messageText)) {
    return null;
  }

  return messageText.replace(RETRY_TRIGGER_PATTERN, '').trim();
}

async function handleMessage(
  messageContext: NonNullable<ReturnType<typeof toMessageContext>>
) {
  const event = messageContext.event;
  if (!shouldHandleMessage(event)) {
    return;
  }
  const { user: userId, text: messageText = '' } = event;

  const ctxId = getContextId(messageContext);
  const trigger = await getTrigger(messageContext, messageContext.botUserId);

  const authorName = await getAuthorName(messageContext, ctxId);
  const content = messageText;
  const retryMessage = parseRetryMessage(messageText);
  const isRetry = retryMessage !== null;
  const messageToProcess = isRetry ? retryMessage : messageText;

  const responseContext = isRetry
    ? {
        ...messageContext,
        event: {
          ...messageContext.event,
          text: messageToProcess,
        },
      }
    : messageContext;

  const { messages, requestHints } = await buildChatContext(responseContext, {
    ...(isRetry ? { messages: [] } : {}),
  });

  if (trigger.type) {
    if (!canUseBot(userId)) {
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
        isRetry,
      },
      `Triggered by ${trigger.type}`
    );

    const result = await generateResponse(
      responseContext,
      messages,
      requestHints,
      isRetry
        ? {
            modelOverride: consentFallbackModel,
            withoutHistory: true,
            overrideMessageText: messageToProcess,
            forceDirectReply: true,
          }
        : undefined
    );

    if (!result.success && result.error && event.channel) {
      await messageContext.client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts ?? event.ts,
        text: result.error,
      });
    }

    logReply(ctxId, authorName, result, 'trigger');
    return;
  }

  if (!canUseBot(userId)) {
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
  await getQueue(ctxId)
    .add(async () => handleMessage(messageContext))
    .catch((error: unknown) => {
      logger.error(
        { ...toLogError(error), ctxId },
        'Failed to process queued message'
      );
    });
}
