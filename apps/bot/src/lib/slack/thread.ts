import { uploadSlackFiles } from '@chat-adapter/slack/api';
import type { Thread } from 'chat';
import { env } from '@/env';
import { slack } from '@/slack';

export interface SlackThread {
  channel: string;
  threadTs: string;
}

export function getThread(thread: Thread): SlackThread | undefined {
  const [adapter, channel, threadTs] = thread.id.split(':');
  if (adapter !== 'slack' || !(channel && threadTs)) {
    return;
  }
  return { channel, threadTs };
}

export async function setThinking(
  thread: Thread,
  status: string
): Promise<void> {
  await slack.startTyping(thread.id, status).catch(() => undefined);
}

export async function uploadSlackFileToThread({
  file,
  filename,
  thread,
  title,
}: {
  file: Buffer;
  filename: string;
  thread: Thread;
  title: string;
}): Promise<void> {
  const slackThread = getThread(thread);
  if (!slackThread) {
    throw new Error('Cannot upload file outside a Slack thread.');
  }
  await uploadSlackFiles([{ data: file, filename, title }], {
    channelId: slackThread.channel,
    threadTs: slackThread.threadTs,
    token: env.SLACK_BOT_TOKEN,
  });
}
