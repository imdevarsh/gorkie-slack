import type { ModelMessage } from 'ai';
import { getConversationMessages } from '~/slack/conversations';
import type { SandboxRequestHints, SlackMessageContext } from '~/types';
import { getTime } from '~/utils/time';
import { reconnectSandbox } from './connect';

const FRACTIONAL_SECONDS = /\.\d+$/;

export async function peekFilesystem(ctxId: string): Promise<string | null> {
  const live = await reconnectSandbox(ctxId);
  if (!live) {
    return null;
  }

  const result = await live
    .runCommand({
      cmd: 'find',
      args: [
        'attachments',
        'output',
        '-maxdepth',
        '3',
        '-type',
        'f',
        '-printf',
        '%T@ %T+ %p\\n',
      ],
    })
    .catch(() => null);

  if (!result) {
    return null;
  }

  const stdout = await result.stdout();
  if (!stdout.trim()) {
    return null;
  }

  return stdout
    .trim()
    .split('\n')
    .map((line) => {
      const first = line.indexOf(' ');
      const second = line.indexOf(' ', first + 1);
      if (first < 0 || second < 0) {
        return { epoch: 0, display: line };
      }
      const epoch = Number(line.slice(0, first));
      const date = line
        .slice(first + 1, second)
        .replace('+', ' ')
        .replace(FRACTIONAL_SECONDS, '');
      const filePath = line.slice(second + 1);
      return { epoch, display: `${date}  ${filePath}` };
    })
    .sort((a, b) => b.epoch - a.epoch)
    .map((entry) => entry.display)
    .join('\n');
}

async function resolveChannelName(
  context: SlackMessageContext
): Promise<string> {
  const channelId = (context.event as { channel?: string }).channel;
  if (!channelId) {
    return 'unknown';
  }
  try {
    const info = await context.client.conversations.info({
      channel: channelId,
    });
    const ch = info.channel;
    if (!ch) {
      return channelId;
    }
    if (ch.is_im) {
      return 'Direct Message';
    }
    return ch.name_normalized ?? ch.name ?? channelId;
  } catch {
    return channelId;
  }
}

async function resolveServerName(
  context: SlackMessageContext
): Promise<string> {
  try {
    const info = await context.client.team.info();
    return info.team?.name ?? 'Slack Workspace';
  } catch {
    return 'Slack Workspace';
  }
}

export interface SandboxContext {
  messages: ModelMessage[];
  requestHints: SandboxRequestHints;
}

export async function buildSandboxContext({
  ctxId,
  context,
}: {
  ctxId: string;
  context: SlackMessageContext;
}): Promise<SandboxContext> {
  const channel = (context.event as { channel?: string }).channel;
  const threadTs = (context.event as { thread_ts?: string }).thread_ts;

  const [messages, existingFiles, channelName, serverName] = await Promise.all([
    channel
      ? getConversationMessages({
          client: context.client,
          channel,
          threadTs,
          botUserId: context.botUserId,
          limit: 5,
        })
      : [],
    peekFilesystem(ctxId),
    resolveChannelName(context),
    resolveServerName(context),
  ]);

  const requestHints: SandboxRequestHints = {
    time: getTime(),
    channel: channelName,
    server: serverName,
    existingFiles,
  };

  return { messages, requestHints };
}
