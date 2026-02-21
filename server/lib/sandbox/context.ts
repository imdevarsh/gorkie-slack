import type { Sandbox } from '@e2b/code-interpreter';
import type { ModelMessage } from 'ai';
import { sandbox as config } from '~/config';
import { getConversationMessages } from '~/slack/conversations';
import type { SandboxRequestHints, SlackMessageContext } from '~/types';
import { resolveChannelName, resolveServerName } from '~/utils/slack';
import { getTime } from '~/utils/time';

export interface SandboxContext {
  messages: ModelMessage[];
  requestHints: SandboxRequestHints;
}

async function listExistingFiles(sandbox: Sandbox): Promise<string | null> {
  try {
    const result = await sandbox.commands.run(
      [
        'find',
        config.paths.attachments,
        config.paths.output,
        '-type',
        'f',
        '-printf',
        "'%T@\\t%p\\n'",
        '2>/dev/null',
        '|',
        'sort',
        "-t$'\\t'",
        '-k1',
        '-rn',
        '|',
        'cut',
        '-f2-',
      ].join(' '),
      { cwd: config.paths.workdir }
    );

    const output = result.stdout.trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

export async function buildSandboxContext(
  context: SlackMessageContext,
  sandbox: Sandbox
): Promise<SandboxContext> {
  const channelId = (context.event as { channel?: string }).channel;
  const threadTs = (context.event as { thread_ts?: string }).thread_ts;

  const [messages, existingFiles, channel, server] = await Promise.all([
    channelId
      ? getConversationMessages({
          client: context.client,
          channel: channelId,
          threadTs,
          botUserId: context.botUserId,
          limit: 5,
        })
      : Promise.resolve([]),
    listExistingFiles(sandbox),
    resolveChannelName(context),
    resolveServerName(context),
  ]);

  return {
    messages,
    requestHints: {
      time: getTime(),
      channel,
      server,
      existingFiles,
    },
  };
}
