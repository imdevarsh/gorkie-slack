import { env } from '~/env';
import logger from '~/lib/logger';
import { getQueue } from '~/lib/queue';
import type { MessageEventArgs } from '~/types';
import { buildChatContext, getContextId } from '~/utils/context';
import { toLogError } from '~/utils/error';
import { logReply } from '~/utils/log';
import { getTrigger } from '~/utils/triggers';
import { generateResponse } from './utils/respond';
import {
  canUseBot,
  getAuthorName,
  hasSupportedSubtype,
  shouldHandleMessage,
  toMessageContext,
} from './utils/message-context';

export const name = 'message';

async function handleMessage(
  args: MessageEventArgs,
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

  const { messages, requestHints } = await buildChatContext(messageContext);

  if (trigger.type) {
    if (!canUseBot(userId)) {
      if (!event.channel) {
        return;
      }

      await args.client.chat.postMessage({
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
    .add(async () => handleMessage(args, messageContext))
    .catch((error: unknown) => {
      logger.error(
        { ...toLogError(error), ctxId },
        'Failed to process queued message'
      );
    });
}
