import type { Thread } from 'chat';
import { slack } from '@/slack';

const LOADING_MESSAGES = [
  'is pondering your question',
  'is working on it',
  'is putting thoughts together',
  'is mulling this over',
  'is figuring this out',
  'is cooking up a response',
  'is connecting the dots',
  'is piecing things together',
  'is giving it a good think',
];

export interface RawSlackThread {
  channel: string;
  threadTs: string;
}

export function rawSlackThreadFrom(thread: Thread): RawSlackThread | undefined {
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
  const slackThread = rawSlackThreadFrom(thread);
  if (!slackThread) {
    return;
  }
  await slack.webClient.assistant.threads
    .setStatus({
      channel_id: slackThread.channel,
      thread_ts: slackThread.threadTs,
      status,
      ...(status ? { loading_messages: LOADING_MESSAGES } : {}),
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
  const slackThread = rawSlackThreadFrom(thread);
  if (!slackThread) {
    throw new Error('Cannot upload file outside a Slack thread.');
  }
  await slack.webClient.files.uploadV2({
    channel_id: slackThread.channel,
    file,
    filename,
    thread_ts: slackThread.threadTs,
    title,
  });
}
