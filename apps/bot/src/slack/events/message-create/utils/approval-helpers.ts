import { createMcpToolApproval, updateMcpToolApproval } from '@repo/db/queries';
import { encryptSecret, parseEncrypted } from '@repo/utils';
import { clampText } from '@repo/utils/text';
import type { ChannelAndBlocks } from '@slack/web-api/dist/types/request/chat';
import type { ModelMessage } from 'ai';
import { z } from 'zod';
import { env } from '@/env';
import { updateTask } from '@/lib/ai/utils/task';
import { formatToolInput } from '@/lib/ai/utils/tool-input';
import { codeBlock, inlineCode, mdText } from '@/slack/blocks';
import { actions } from '@/slack/features/customizations/mcp/ids';
import type {
  ChatRequestHints,
  SlackMessageContext,
  Stream,
  ToolApprovalRequest,
} from '@/types';

type SlackBlocks = ChannelAndBlocks['blocks'];

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
  const parsed = parseEncrypted({
    encrypted: state,
    schema: approvalStateSchema,
    secret: env.MCP_TOKEN_ENCRYPTION_KEY,
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
  toolName,
}: {
  input?: string;
  serverName?: string;
  text: string;
  toolName?: string;
}): SlackBlocks {
  return [
    {
      type: 'card',
      title: {
        type: 'mrkdwn',
        text: 'MCP approval handled',
      },
      body: {
        type: 'mrkdwn',
        text: clampText(
          [
            serverName && toolName
              ? `${mdText(serverName)} / ${inlineCode(toolName)}`
              : null,
            mdText(text),
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

  const blocks: SlackBlocks = [
    {
      type: 'card',
      title: {
        type: 'mrkdwn',
        text: 'MCP approval needed',
      },
      body: {
        type: 'mrkdwn',
        text: clampText(
          `${mdText(approval.serverName)} / ${inlineCode(approval.toolName)}\nInput:\n${codeBlock({ value: args || '{}', maxLength: 180 })}`,
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
      userId: context.event.user ?? '',
      values: { messageTs: message.ts },
    });
  }
}
