import type { ModelMessage } from 'ai';
import { getConversationMessages } from '~/slack/conversations';
import type { SandboxRequestHints, SlackMessageContext } from '~/types';
import { resolveChannelName, resolveServerName } from '~/utils/slack';
import { getTime } from '~/utils/time';
import { reconnectSandbox } from './lifecycle';

export async function peekFilesystem(ctxId: string): Promise<string | null> {
  const live = await reconnectSandbox(ctxId);
  if (!live) {
    return null;
  }

  const result = await live
    .runCommand({
      cmd: 'sh',
      args: [
        '-c',
        "fd --type f . attachments output --max-depth 3 -X stat -c '%Y\\t%T+ %n' 2>/dev/null | sort -t$'\\t' -k1 -rn | cut -f2-",
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

  return stdout.trim();
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
