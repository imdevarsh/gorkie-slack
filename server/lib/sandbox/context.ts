import type { ModelMessage } from 'ai';
import { getConversationMessages } from '~/slack/conversations';
import type { SlackMessageContext } from '~/types';
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

function messageToText(message: ModelMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  return message.content
    .map((part) => ('text' in part ? part.text : '[image]'))
    .join(' ');
}

interface BuildContextOptions {
  ctxId: string;
  context: SlackMessageContext;
}

export async function buildSandboxContext({
  ctxId,
  context,
}: BuildContextOptions): Promise<string> {
  const channel = (context.event as { channel?: string }).channel;
  const threadTs = (context.event as { thread_ts?: string }).thread_ts;

  const [recent, fileListing] = await Promise.all([
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
  ]);

  const parts: string[] = [];

  const recentText = recent.map(messageToText).join('\n');
  if (recentText) {
    parts.push(
      `<recent_thread_context>\n${recentText}\n</recent_thread_context>`
    );
  }

  if (fileListing) {
    parts.push(
      `<sandbox_files>\nFiles already in the sandbox (newest first):\n${fileListing}\n</sandbox_files>`
    );
  }

  return parts.join('\n\n');
}
