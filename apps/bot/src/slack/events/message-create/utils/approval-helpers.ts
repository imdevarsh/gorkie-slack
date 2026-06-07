import {
  createMCPToolApproval,
  getMCPServerById,
  supersedePendingMCPToolApprovals,
  updateMCPToolApproval,
} from '@repo/db/queries';
import { clampText } from '@repo/utils/text';
import type { ChannelAndBlocks } from '@slack/web-api/dist/types/request/chat';
import type { ModelMessage } from 'ai';
import { updateTask } from '@/lib/ai/utils/task';
import { encrypt, parseEncrypted } from '@/lib/mcp/encryption';
import { formatToolName } from '@/lib/mcp/format-tool-name';
import { buttonElement, cardBlock, codeBlock } from '@/slack/blocks';
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
  const expired = await supersedePendingMCPToolApprovals({
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
      const server = await getMCPServerById({
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
  const parsed = parseEncrypted({
    encrypted: state,
    schema: approvalStateSchema,
  });
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
    title: `Using ${approval.serverName}: ${formatToolName(approval.toolName)}`,
    details: clampText(
      `Input:\n${JSON.stringify(approval.input, null, 2)}`,
      1200
    ),
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
      serverName && toolName && input ? null : text,
      input ? `Input:\n${codeBlock({ value: input, maxLength: 180 })}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    200
  );

  return [cardBlock({ body, title: cardTitle })];
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

  await createMCPToolApproval({
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
    cardBlock({
      actions: [
        buttonElement({
          actionId: actions.approval.allow,
          style: 'primary',
          text: 'Approve once',
          value: approval.approvalId,
        }),
        buttonElement({
          actionId: actions.approval.always,
          text: 'Always in thread',
          value: approval.approvalId,
        }),
        buttonElement({
          actionId: actions.approval.deny,
          style: 'danger',
          text: 'Deny',
          value: approval.approvalId,
        }),
      ],
      body: clampText(
        `Input:\n${codeBlock({ value: args || '{}', maxLength: 180 })}`,
        200
      ),
      title: `Approve: ${approval.serverName} / ${formatToolName(approval.toolName)}`,
    }),
  ];

  const message = await context.client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `Approve ${approval.serverName}: ${approval.toolName}`,
    blocks,
  });
  if (message.ts) {
    await updateMCPToolApproval({
      approvalId: approval.approvalId,
      userId,
      values: { messageTs: message.ts },
    });
  }
}
