import { createMcpToolApproval } from '@repo/db/queries';
import { decryptSecret, encryptSecret } from '@repo/utils';
import { clampText } from '@repo/utils/text';
import type { ChannelAndBlocks } from '@slack/web-api/dist/types/request/chat';
import type { ModelMessage } from 'ai';
import { env } from '@/env';
import { updateTask } from '@/lib/ai/utils/task';
import { formatToolInput } from '@/lib/mcp/format-tool-input';
import { actions } from '@/slack/features/customizations/mcp/ids';
import type {
  ChatRequestHints,
  SlackMessageContext,
  Stream,
  ToolApprovalRequest,
} from '@/types';

type SlackBlocks = ChannelAndBlocks['blocks'];

export function asSlackBlocks(blocks: unknown[]): SlackBlocks {
  return blocks as SlackBlocks;
}

export function decodeApprovalState({ state }: { state: string }): {
  messages: ModelMessage[];
  requestHints: ChatRequestHints;
} {
  return JSON.parse(
    decryptSecret({
      encrypted: state,
      secret: env.MCP_TOKEN_ENCRYPTION_KEY,
    })
  ) as { messages: ModelMessage[]; requestHints: ChatRequestHints };
}

export async function recordApprovalTask({
  approval,
  stream,
}: {
  approval: ToolApprovalRequest;
  stream: Stream;
}) {
  await updateTask(stream, {
    taskId: approval.toolCallId,
    title: `Using ${approval.serverName} MCP: ${approval.toolName}`,
    details: clampText(formatToolInput(approval.input), 1200),
    status: 'complete',
    output: 'Approval needed',
  });
}

export async function postApprovalRequest({
  approval,
  context,
  messages,
  requestHints,
}: {
  approval: ToolApprovalRequest;
  context: SlackMessageContext;
  messages: ModelMessage[];
  requestHints: ChatRequestHints;
}) {
  const channel = context.event.channel;
  const threadTs = context.event.thread_ts ?? context.event.ts;
  const args = JSON.stringify(approval.input, null, 2) ?? '';

  await createMcpToolApproval({
    approvalId: approval.approvalId,
    argsJson: encryptSecret({
      plaintext: clampText(args, 8000),
      secret: env.MCP_TOKEN_ENCRYPTION_KEY,
    }),
    channelId: channel,
    eventTs: context.event.ts,
    exposedName: approval.exposedName,
    state: encryptSecret({
      plaintext: JSON.stringify({ messages, requestHints }),
      secret: env.MCP_TOKEN_ENCRYPTION_KEY,
    }),
    serverId: approval.serverId,
    status: 'pending',
    teamId: context.teamId ?? null,
    threadTs,
    toolCallId: approval.toolCallId,
    toolName: approval.toolName,
    userId: context.event.user ?? '',
  });

  await context.client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `Approve ${approval.serverName}: ${approval.toolName}`,
    blocks: asSlackBlocks([
      {
        type: 'card',
        title: {
          type: 'mrkdwn',
          text: `Approve: ${approval.serverName} · ${approval.toolName}`,
        },
        body: {
          type: 'mrkdwn',
          text: clampText(`Input:\n\`\`\`${args || '{}'}\`\`\``, 200),
        },
        actions: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Approve once', emoji: false },
            style: 'primary',
            action_id: actions.approvalApprove,
            value: approval.approvalId,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Always in thread',
              emoji: false,
            },
            action_id: actions.approvalAlwaysThread,
            value: approval.approvalId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Deny', emoji: false },
            style: 'danger',
            action_id: actions.approvalDeny,
            value: approval.approvalId,
          },
        ],
      },
    ]),
  });
}
