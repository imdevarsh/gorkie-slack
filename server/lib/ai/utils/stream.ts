import type {
  ChatAppendStreamArguments,
  ChatStartStreamArguments,
  ChatStopStreamArguments,
} from '@slack/web-api';
import logger from '~/lib/logger';
import type {
  PlanChunk,
  SlackMessageContext,
  Stream,
  TaskChunk,
} from '~/types';
import { getContextId } from '~/utils/context';
import { toLogError } from '~/utils/error';
import { setStatus } from './status';

export async function initStream(
  context: SlackMessageContext
): Promise<Stream> {
  const channelId = (context.event as { channel?: string }).channel;
  const ctxId = getContextId(context);

  if (!channelId) {
    logger.warn({ ctxId }, 'Cannot init stream: missing channel ID');
    return {
      channel: '',
      ts: '',
      client: context.client,
      tasks: new Map(),
      thought: false,
      noop: true,
    };
  }

  const threadTs =
    (context.event as { thread_ts?: string }).thread_ts ?? context.event.ts;
  const userId = (context.event as { user?: string }).user;

  let ts: string;
  try {
    const response = await context.client.chat.startStream({
      channel: channelId,
      thread_ts: threadTs,
      recipient_team_id: context.teamId,
      recipient_user_id: userId,
      task_display_mode: 'plan',
    } as unknown as ChatStartStreamArguments);

    if (!response.ts) {
      throw new Error('chat.startStream returned no ts');
    }

    ts = response.ts;
  } catch (error) {
    logger.error({ ...toLogError(error), ctxId }, 'Failed to start stream');
    return {
      channel: channelId,
      ts: '',
      client: context.client,
      tasks: new Map(),
      thought: false,
      noop: true,
    };
  }

  const stream: Stream = {
    channel: channelId,
    ts,
    client: context.client,
    tasks: new Map(),
    thought: false,
  };

  await setStatus(context, { status: '' });

  return stream;
}

export async function closeStream(stream: Stream): Promise<void> {
  if (stream.noop) {
    return;
  }
  try {
    await stream.client.chat.stopStream({
      channel: stream.channel,
      ts: stream.ts,
    } as unknown as ChatStopStreamArguments);
  } catch (error) {
    logger.warn(
      { ...toLogError(error), channel: stream.channel },
      'Failed to close stream'
    );
  }
}

export async function setPlanTitle(
  stream: Stream,
  title: string
): Promise<void> {
  await safeAppend(stream, [{ type: 'plan_update', title }]);
}

export async function safeAppend(
  stream: Stream,
  chunks: (TaskChunk | PlanChunk)[]
): Promise<void> {
  if (stream.noop) {
    return;
  }
  try {
    await stream.client.chat.appendStream({
      channel: stream.channel,
      ts: stream.ts,
      chunks,
    } as unknown as ChatAppendStreamArguments);
  } catch (error) {
    logger.warn(
      { ...toLogError(error), channel: stream.channel },
      'Failed to append to stream'
    );
  }
}
