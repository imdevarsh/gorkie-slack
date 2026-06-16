import type { Message, Thread } from 'chat';
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

export function slackThreadOf(thread: Thread):
  | {
      channel: string;
      threadTs: string;
    }
  | undefined {
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
  const slackThread = slackThreadOf(thread);
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

export async function acknowledgeSteer({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<void> {
  await setThinking(thread, 'got your update');
  const slackThread = slackThreadOf(thread);
  if (!slackThread) {
    return;
  }

  const preview = message.text.trim().replace(/\s+/g, ' ').slice(0, 120);
  await slack.webClient.chat
    .postEphemeral({
      channel: slackThread.channel,
      text: preview
        ? `Got it - applying this to the current run: "${preview}"`
        : 'Got it - applying your latest message to the current run.',
      thread_ts: slackThread.threadTs,
      user: message.author.userId,
    })
    .catch(() => undefined);
}

export async function uploadToThread({
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
  const slackThread = slackThreadOf(thread);
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
