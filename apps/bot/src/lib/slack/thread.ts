import { uploadSlackFiles } from '@chat-adapter/slack/api';
import type { Thread } from 'chat';
import { env } from '@/env';
import { slack } from '@/lib/chat';

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

export async function setThinking(thread: Thread): Promise<void> {
  const slackThread = getThread(thread);
  if (!slackThread) {
    return;
  }

  await slack.webClient
    .apiCall('assistant.threads.setStatus', {
      channel_id: slackThread.channel,
      loading_messages: [
        'is pondering your question',
        'is working on it',
        'is putting thoughts together',
        'is mulling this over',
        'is figuring this out',
        'is cooking up a response',
        'is connecting the dots',
        'is working through this',
        'is piecing things together',
        'is giving it a good think',
      ],
      status: 'is thinking',
      thread_ts: slackThread.threadTs,
    })
    .catch(() => undefined);
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
