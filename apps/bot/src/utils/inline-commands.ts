import { abortStream } from '@/lib/abort';
import logger from '@/lib/logger';
import { clearQueue } from '@/lib/queue';
import { abortActiveSandbox } from '@/lib/sandbox/active';
import type { SlackMessageContext } from '@/types';

const INLINE_COMMAND_RE = /^!(\w+)/i;

async function handleStop(
  context: SlackMessageContext,
  ctxId: string
): Promise<void> {
  clearQueue(ctxId);

  const { thread_ts: threadTs, channel } = context.event;
  const stoppingMsg = await context.client.chat
    .postMessage({
      channel,
      ...(threadTs ? { thread_ts: threadTs } : {}),
      text: 'Stopping... :thonk-spin:',
    })
    .catch((error: unknown) => {
      logger.warn({ error, ctxId }, '[stop] Failed to post stopping message');
      return null;
    });

  await abortActiveSandbox(ctxId);
  abortStream(ctxId);

  logger.info({ ctxId }, '[stop] Stopped');

  await context.client.chat
    .update({
      channel,
      ts: stoppingMsg?.ts ?? '',
      text: 'Stopped.',
    })
    .catch((error: unknown) =>
      logger.warn({ error, ctxId }, '[stop] Failed to update stop message')
    );
}

export async function handleInlineCommand(
  context: SlackMessageContext,
  ctxId: string,
  text: string
): Promise<'handled' | 'not-handled'> {
  const trimmed = text.trim().toLowerCase();
  const command =
    INLINE_COMMAND_RE.exec(text)?.[1]?.toLowerCase() ??
    (trimmed === 'stop' ? 'stop' : null);

  if (!command) {
    return 'not-handled';
  }

  switch (command) {
    case 'stop':
      await handleStop(context, ctxId);
      return 'handled';
    default:
      return 'not-handled';
  }
}
