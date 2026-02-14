import type { ModelMessage } from 'ai';
import { getConversationMessages } from '~/slack/conversations';
import type { SandboxRequestHints, SlackMessageContext } from '~/types';
import { resolveChannelName, resolveServerName } from '~/utils/slack';
import { getTime } from '~/utils/time';
import { reconnectSandbox } from './session';

export async function peekFilesystem(
  context: SlackMessageContext
): Promise<string | null> {
  const live = await reconnectSandbox(context);
  if (!live) {
    return null;
  }

  const result = await live.process
    .executeCommand(
      "find attachments output -type f -printf '%T@\\t%p\\n' 2>/dev/null | sort -nr | cut -f2-"
    )
    .catch(() => null);

  if (!result) {
    return null;
  }

  const stdout = result.result;
  if (!stdout.trim()) {
    return null;
  }

  return stdout.trim();
}

export interface SandboxContext {
  messages: ModelMessage[];
  requestHints: SandboxRequestHints;
}

export async function buildSandboxContext(
  context: SlackMessageContext
): Promise<SandboxContext> {
  const channel = (context.event as { channel?: string }).channel;
  const threadTs = (context.event as { thread_ts?: string }).thread_ts;

  const [messages, existingFiles, metadata] = await Promise.all([
    channel
      ? getConversationMessages({
          client: context.client,
          channel,
          threadTs,
          botUserId: context.botUserId,
          limit: 5,
        })
      : [],
    peekFilesystem(context),
    buildMetadata(context),
  ]);

  return {
    messages,
    requestHints: {
      time: getTime(),
      channel: metadata.channel,
      server: metadata.server,
      existingFiles,
    },
  };
}

async function buildMetadata(
  context: SlackMessageContext
): Promise<{ channel: string; server: string }> {
  const [channel, server] = await Promise.all([
    resolveChannelName(context),
    resolveServerName(context),
  ]);
  return { channel, server };
}
