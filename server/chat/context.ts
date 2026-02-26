import type { SlackAdapter } from '@chat-adapter/slack';
import type { WebClient } from '@slack/web-api';
import type { Chat, Message, Thread } from 'chat';
import type { ChatRuntimeContext } from '~/types';
import type { SlackFile } from '~/utils/images';

interface RawSlackMessage {
  channel?: string;
  channel_type?: string;
  event_ts?: string;
  files?: SlackFile[];
  team?: string;
  team_id?: string;
  text?: string;
  thread_ts?: string;
  ts?: string;
  user?: string;
}

function coerceSlackFiles(message: Message): SlackFile[] | undefined {
  const rawFiles = (message.raw as RawSlackMessage | null)?.files;
  if (rawFiles?.length) {
    return rawFiles;
  }

  if (!message.attachments?.length) {
    return undefined;
  }

  return message.attachments.map((attachment, index) => ({
    id: `${message.id}-${index}`,
    mimetype: attachment.mimeType,
    name: attachment.name,
    size: attachment.size,
    url_private: attachment.url,
    url_private_download: attachment.url,
  }));
}

export function buildRuntimeContext(params: {
  chat: Chat;
  client: WebClient;
  message: Message;
  slack: SlackAdapter;
  thread: Thread;
}): ChatRuntimeContext {
  const { chat, thread, message, slack, client } = params;
  const decoded = slack.decodeThreadId(thread.id);
  const raw = (message.raw as RawSlackMessage | null) ?? {};

  const eventTs = raw.event_ts ?? raw.ts ?? message.id;
  const messageTs = raw.ts ?? message.id;
  const threadTs = raw.thread_ts ?? decoded.threadTs;

  return {
    botUserId: slack.botUserId,
    chat,
    thread,
    message,
    slack,
    client,
    teamId: raw.team_id ?? raw.team,
    channelId: decoded.channel,
    threadId: thread.id,
    userId: message.author.userId,
    event: {
      channel: decoded.channel,
      channel_type: raw.channel_type,
      event_ts: eventTs,
      files: coerceSlackFiles(message),
      text: message.text,
      thread_ts: threadTs,
      ts: messageTs,
      user: message.author.userId,
    },
  };
}
