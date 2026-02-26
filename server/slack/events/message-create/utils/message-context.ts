import { isUserAllowed } from '~/lib/allowed-users';
import logger from '~/lib/logger';
import type {
  MessageEventArgs,
  MessageEventView,
  SlackMessageContext,
} from '~/types';
import { toLogError } from '~/utils/error';
import { isUsableMessage } from '~/utils/messages';
import { contextUserId, eventUserId } from '~/utils/slack-event';

export function hasSupportedSubtype(args: MessageEventArgs): boolean {
  const subtype = args.event.subtype;
  return !subtype || subtype === 'thread_broadcast' || subtype === 'file_share';
}

export function toMessageContext(
  args: MessageEventArgs
): SlackMessageContext | null {
  const { event, context, client, body } = args;
  const userId = eventUserId(event);

  if (!hasSupportedSubtype(args)) {
    return null;
  }

  if ('bot_id' in event && event.bot_id) {
    return null;
  }

  if (context.botUserId && userId === context.botUserId) {
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

export function toMessageEventView(
  context: SlackMessageContext
): MessageEventView {
  return context.event as MessageEventView;
}

export function shouldHandleMessage(
  event: MessageEventView
): event is MessageEventView & { user: string } {
  const messageText = event.text ?? '';
  return Boolean(event.user) && isUsableMessage(messageText);
}

export function canUseBot(userId: string): boolean {
  return isUserAllowed(userId);
}

export async function getAuthorName(
  ctx: SlackMessageContext,
  ctxId: string
): Promise<string> {
  const userId = contextUserId(ctx);
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
      { ...toLogError(error), userId, ctxId },
      'Failed to fetch user info for logging'
    );
    return userId;
  }
}
