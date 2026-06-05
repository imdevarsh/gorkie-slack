import {
  createMcpToolApproval,
  getMcpServerByIdForUser,
  supersedePendingMcpToolApprovals,
  updateMcpToolApproval,
} from '@repo/db/queries';
import { clampText } from '@repo/utils/text';
import type { ChannelAndBlocks } from '@slack/web-api/dist/types/request/chat';
import type { ModelMessage } from 'ai';
import { z } from 'zod';
import { updateTask } from '@/lib/ai/utils/task';
import { formatToolInput } from '@/lib/ai/utils/tool-input';
import { encrypt, parseEncrypted } from '@/lib/mcp/secret';
import { codeBlock } from '@/slack/blocks';
import { actions } from '@/slack/features/customizations/mcp/ids';
import type { ApprovalReply } from '@/slack/features/customizations/mcp/reply';
import type {
  ChatRequestHints,
  SlackMessageContext,
  Stream,
  ToolApprovalRequest,
} from '@/types';

type SlackBlocks = ChannelAndBlocks['blocks'];

/**
 * The whole approval decision as one value (opencode's permission `Reply`),
 * carried with the tool it refers to. `approved`/`reason` are derived from
 * `reply` by the resume path — never passed alongside it.
 */
export interface ApprovalOutcome {
  approvalId: string;
  reply: ApprovalReply;
  tool: { serverName: string; toolCallId: string; toolName: string };
}

/**
 * When a user sends a newer message, pending approvals in that channel/thread
 * are superseded and their cards flipped to "expired". Keeps approval lifecycle
 * out of the response path.
 */
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
      const server = await getMcpServerByIdForUser({
        id: approval.serverId,
        userId: approval.userId,
      });
      await context.client.chat
        .update({
          channel: approval.channelId,
          ts: approval.messageTs,
          text: 'This MCP approval request expired.',
          blocks: handledApprovalBlocks({
            serverName: server?.name ?? approval.exposedName,
            text: 'Approval expired because you sent a newer message.',
            title: 'Approval Expired',
            toolName: approval.toolName,
          }),
        })
        .catch(() => undefined);
    })
  );
}

const approvalStateSchema = z.object({
  messages: z.array(z.custom<ModelMessage>()),
  requestHints: z.object({
    channel: z.string(),
    customization: z
      .object({
        prompt: z.string(),
      })
      .optional(),
    server: z.string(),
    time: z.string(),
  }),
});

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

  return [
    {
      type: 'card',
      title: { type: 'mrkdwn', text: cardTitle },
      body: {
        type: 'mrkdwn',
        text: clampText(
          [
            serverName && toolName && input ? null : text,
            input
              ? `Input:\n${codeBlock({ value: input, maxLength: 180 })}`
              : null,
          ]
            .filter(Boolean)
            .join('\n'),
          260
        ),
      },
    },
  ];
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
    argsJson: encrypt(clampText(args, 8000)),
    channelId: channel,
    eventTs: context.event.ts,
    exposedName: approval.exposedName,
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
    {
      type: 'card',
      title: {
        type: 'mrkdwn',
        text: `Approve: ${approval.serverName} / ${approval.toolName}`,
      },
      body: {
        type: 'mrkdwn',
        text: clampText(
          `Input:\n${codeBlock({ value: args || '{}', maxLength: 180 })}`,
          200
        ),
      },
      actions: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve once', emoji: false },
          style: 'primary',
          action_id: actions.approval.allow,
          value: approval.approvalId,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Always in thread',
            emoji: false,
          },
          action_id: actions.approval.always,
          value: approval.approvalId,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Deny', emoji: false },
          style: 'danger',
          action_id: actions.approval.deny,
          value: approval.approvalId,
        },
      ],
    },
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
