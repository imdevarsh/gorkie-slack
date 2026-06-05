import {
  createMcpToolApproval,
  getMcpServerById,
  supersedePendingMcpToolApprovals,
  updateMcpToolApproval,
} from '@repo/db/queries';
import { clampText } from '@repo/utils/text';
import type { ChannelAndBlocks } from '@slack/web-api/dist/types/request/chat';
import type { ModelMessage } from 'ai';
import { Blocks, Elements, Message } from 'slack-block-builder';
import { updateTask } from '@/lib/ai/utils/task';
import { formatToolInput } from '@/lib/ai/utils/tool-input';
import { encrypt, parseEncrypted } from '@/lib/mcp/encryption';
import { codeBlock } from '@/slack/blocks';
import { actions } from '@/slack/features/customizations/mcp/ids';
import type { ApprovalReply } from '@/slack/features/customizations/mcp/reply';
import type {
  ChatRequestHints,
  SlackMessageContext,
  Stream,
  ToolApprovalRequest,
} from '@/types';
import { approvalStateSchema } from './schema';

type SlackBlocks = ChannelAndBlocks['blocks'];

export interface ApprovalOutcome {
  approvalId: string;
  reply: ApprovalReply;
}

export async function supersedeExpiredApprovals(
  context: SlackMessageContext
): Promise<void> {
  const userId = context.event.user;
  const channelId = context.event.channel;
  if (!(userId && channelId)) {
    return;
  }
  const expired = await supersedePendingMcpToolApprovals({
    channelId,
    threadTs:
      context.event.channel_type === 'im'
        ? null
        : (context.event.thread_ts ?? context.event.ts),
    userId,
  });
  await Promise.all(
    expired.map(async (approval) => {
      if (!approval.messageTs) {
        return;
      }
      const server = await getMcpServerById({
        id: approval.serverId,
        userId: approval.userId,
      });
      await context.client.chat
        .update({
          channel: approval.channelId,
          ts: approval.messageTs,
          text: 'This MCP approval request expired.',
          blocks: handledApprovalBlocks({
            serverName: server?.name ?? approval.toolName,
            text: 'Approval expired because you sent a newer message.',
            title: 'Approval Expired',
            toolName: approval.toolName,
          }),
        })
        .catch(() => undefined);
    })
  );
}

export function decodeApprovalState({ state }: { state: string }): {
  messages: ModelMessage[];
  requestHints: ChatRequestHints;
} {
  const parsed = parseEncrypted(state, approvalStateSchema);
  if (!parsed) {
    throw new Error('Missing MCP approval state.');
  }
  return parsed;
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

export function handledApprovalBlocks({
  input,
  serverName,
  text,
  title,
  toolName,
}: {
  input?: string;
  serverName?: string;
  text: string;
  title: string;
  toolName?: string;
}): SlackBlocks {
  const cardTitle =
    serverName && toolName ? `${title}: ${serverName} / ${toolName}` : title;

  const body = clampText(
    [
      `*${cardTitle}*`,
      serverName && toolName && input ? null : text,
      input ? `Input:\n${codeBlock({ value: input, maxLength: 180 })}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    260
  );

  return Message()
    .blocks(Blocks.Section({ text: body }))
    .getBlocks();
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
  const userId = context.event.user;
  if (!userId) {
    return;
  }
  const channel = context.event.channel;
  const threadTs = context.event.thread_ts ?? context.event.ts;
  const args = JSON.stringify(approval.input, null, 2) ?? '';

  await createMcpToolApproval({
    approvalId: approval.approvalId,
    args: encrypt(clampText(args, 8000)),
    channelId: channel,
    eventTs: context.event.ts,
    state: encrypt(JSON.stringify({ messages, requestHints })),
    serverId: approval.serverId,
    status: 'pending',
    teamId: context.teamId ?? null,
    threadTs,
    toolCallId: approval.toolCallId,
    toolName: approval.toolName,
    userId,
  });

  const blocks: SlackBlocks = [
    ...Message()
      .blocks(
        Blocks.Section({
          text: clampText(
            `*Approve: ${approval.serverName} / ${approval.toolName}*\nInput:\n${codeBlock({ value: args || '{}', maxLength: 180 })}`,
            260
          ),
        }),
        Blocks.Actions().elements(
          Elements.Button({
            actionId: actions.approval.allow,
            text: 'Approve once',
            value: approval.approvalId,
          }).primary(),
          Elements.Button({
            actionId: actions.approval.always,
            text: 'Always in thread',
            value: approval.approvalId,
          }),
          Elements.Button({
            actionId: actions.approval.deny,
            text: 'Deny',
            value: approval.approvalId,
          }).danger()
        )
      )
      .getBlocks(),
  ];

  const message = await context.client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `Approve ${approval.serverName}: ${approval.toolName}`,
    blocks,
  });
  if (message.ts) {
    await updateMcpToolApproval({
      approvalId: approval.approvalId,
      userId,
      values: { messageTs: message.ts },
    });
  }
}
