import logger from '~/lib/logger';
import { clearQueue } from '~/lib/queue';
import type { SlackMessageContext } from '~/types';

const INLINE_COMMAND_RE = /^!(\w+)/i;

async function handleStop(
  context: SlackMessageContext,
  ctxId: string
): Promise<void> {
  clearQueue(ctxId);
  logger.info({ ctxId }, 'Queue cleared via stop');
  const { thread_ts: threadTs, channel } = context.event;
  await context.client.chat
    .postMessage({
      channel,
      ...(threadTs ? { thread_ts: threadTs } : {}),
      text: "Got it, I've stopped responding in this thread.",
    })
    .catch((error) =>
      logger.warn({ error, ctxId }, 'Failed to send stop message')
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
