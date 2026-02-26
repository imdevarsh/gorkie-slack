import { isUserAllowed } from '~/lib/allowed-users';
import logger from '~/lib/logger';
import type {
  MessageEventArgs,
  SlackMessageEvent,
  SlackMessageContext,
  SlackRawMessageEvent,
} from '~/types';
import { toLogError } from '~/utils/error';
import { isUsableMessage } from '~/utils/messages';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeEvent(event: SlackRawMessageEvent): SlackMessageEvent | null {
  const record = asRecord(event);
  const channel = typeof event.channel === 'string' ? event.channel : undefined;
  const ts = typeof event.ts === 'string' ? event.ts : undefined;
  const eventTs =
    typeof record?.event_ts === 'string' ? (record.event_ts as string) : ts;
  if (!(channel && ts && eventTs)) {
    return null;
  }

  const files = Array.isArray(record?.files) ? record.files : undefined;
  const assistantThread = asRecord(record?.assistant_thread);

  return {
    channel,
    ts,
    event_ts: eventTs,
    text: typeof record?.text === 'string' ? record.text : undefined,
    user: typeof record?.user === 'string' ? record.user : undefined,
    thread_ts:
      typeof record?.thread_ts === 'string' ? record.thread_ts : undefined,
    channel_type:
      typeof record?.channel_type === 'string'
        ? record.channel_type
        : undefined,
    subtype: typeof record?.subtype === 'string' ? record.subtype : undefined,
    bot_id: typeof record?.bot_id === 'string' ? record.bot_id : undefined,
    files,
    assistant_thread:
      typeof assistantThread?.action_token === 'string'
        ? { action_token: assistantThread.action_token }
        : undefined,
  };
}

export function hasSupportedSubtype(args: MessageEventArgs): boolean {
  const subtype = args.event.subtype;
  return !subtype || subtype === 'thread_broadcast' || subtype === 'file_share';
}

export function toMessageContext(
  args: MessageEventArgs
): SlackMessageContext | null {
  const { event, context, client, body } = args;
  const userId =
    typeof (event as { user?: unknown }).user === 'string'
      ? (event as { user: string }).user
      : undefined;

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

  const normalized = normalizeEvent(event);
  if (!normalized) {
    return null;
  }

  return {
    event: normalized,
    client,
    botUserId: context.botUserId,
    teamId:
      context.teamId ??
      (typeof body === 'object' && body
        ? (body as { team_id?: string }).team_id
        : undefined),
  } satisfies SlackMessageContext;
}

export function shouldHandleMessage(
  event: SlackMessageEvent
): event is SlackMessageEvent & { user: string } {
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
  const userId = ctx.event.user;
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
