import { asRecord } from '@repo/utils/record';
import type {
  MessageEventArgs,
  SlackFile,
  SlackMessageContext,
  SlackMessageEvent,
  SlackRawMessageEvent,
} from '@/types';
import { getSlackUser } from '@/utils/users';

function isSlackFile(value: unknown): value is SlackFile {
  return Boolean(asRecord(value));
}

function normalizeEvent(event: SlackRawMessageEvent): SlackMessageEvent | null {
  const record = asRecord(event);
  const channel = typeof record?.channel === 'string' ? record.channel : null;
  const ts = typeof record?.ts === 'string' ? record.ts : null;
  const eventTs = typeof record?.event_ts === 'string' ? record.event_ts : ts;
  if (!(channel && ts && eventTs)) {
    return null;
  }

  const files =
    Array.isArray(record?.files) && record.files.every(isSlackFile)
      ? (record.files as SlackFile[])
      : undefined;
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
  const eventRecord = asRecord(event);
  const bodyRecord = asRecord(body);
  const userId =
    typeof eventRecord?.user === 'string' ? eventRecord.user : undefined;

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
      (typeof bodyRecord?.team_id === 'string'
        ? bodyRecord.team_id
        : undefined),
  } satisfies SlackMessageContext;
}

export function shouldHandleMessage(
  event: SlackMessageEvent
): event is SlackMessageEvent & { user: string } {
  const messageText = event.text ?? '';
  return Boolean(event.user) && !messageText.startsWith('##');
}

export async function getAuthorName(ctx: SlackMessageContext): Promise<string> {
  const userId = ctx.event.user;
  if (!userId) {
    return 'unknown';
  }
  const user = await getSlackUser(ctx.client, userId);
  return user.name;
}
