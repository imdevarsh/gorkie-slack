import {
  claimMcpToolApproval,
  getMcpToolApprovalStatus,
  updateMcpToolApproval,
  upsertMcpToolPermission,
} from '@repo/db/queries';
import { decryptSecret } from '@repo/utils';
import { asRecord } from '@repo/utils/record';
import { clampText } from '@repo/utils/text';
import type { ChannelAndBlocks } from '@slack/web-api/dist/types/request/chat';
import { env } from '@/env';
import logger from '@/lib/logger';
import { getQueue } from '@/lib/queue';
import { codeBlock, mdText } from '@/slack/blocks';
import { decodeApprovalState } from '@/slack/events/message-create/utils/approval-helpers';
import { resumeResponse } from '@/slack/events/message-create/utils/respond';
import type { SlackMessageContext } from '@/types';
import { getContextId } from '@/utils/context';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';

type SlackBlocks = ChannelAndBlocks['blocks'];

export const approveName = actions.approval.allow;
export const alwaysThreadName = actions.approval.always;
export const denyName = actions.approval.deny;

async function updateApprovalMessage({
  body,
  client,
  input,
  text,
}: ButtonArgs & { input?: string; text: string }) {
  const container = asRecord(body.container);
  const message = asRecord(body.message);
  const channel = container?.channel_id;
  const ts = message?.ts;
  if (!(typeof channel === 'string' && typeof ts === 'string')) {
    return;
  }

  const blocks: SlackBlocks = [
    {
      type: 'card',
      title: {
        type: 'mrkdwn',
        text: mdText(text),
      },
      body: {
        type: 'mrkdwn',
        text: input
          ? clampText(
              `Input:\n${codeBlock({ value: input, maxLength: 180 })}`,
              200
            )
          : mdText(text),
      },
    },
  ];

  await client.chat
    .update({ channel, ts, text, blocks })
    .catch(() => undefined);
}

export async function execute(args: ButtonArgs): Promise<void> {
  const { ack, action, body, client, context } = args;
  await ack();
  const approvalId = action.value;
  if (!approvalId) {
    return;
  }

  const status = await getMcpToolApprovalStatus({
    approvalId,
  });
  if (status && status.userId !== body.user.id) {
    const container = asRecord(body.container);
    const channel = container?.channel_id;
    if (typeof channel === 'string') {
      await client.chat
        .postEphemeral({
          channel,
          text: 'This MCP approval request is not yours.',
          user: body.user.id,
        })
        .catch(() => undefined);
    }
    return;
  }

  if (!status || status.status !== 'pending') {
    await updateApprovalMessage({
      ...args,
      text: 'This MCP approval request has already been handled.',
    });
    return;
  }

  const approved = action.action_id !== denyName;
  const alwaysInThread = action.action_id === alwaysThreadName;
  const approval = await claimMcpToolApproval({
    approvalId,
    userId: body.user.id,
  });
  if (!approval) {
    await updateApprovalMessage({
      ...args,
      text: 'This MCP approval request has already been handled.',
    });
    return;
  }

  let resultText = `Access denied for ${approval.toolName}.`;
  if (approved) {
    resultText = alwaysInThread
      ? `Approved ${approval.toolName} for this thread.`
      : `Approved ${approval.toolName} once.`;
  }

  let input: string | undefined;
  try {
    input = approval.argsJson
      ? decryptSecret({
          encrypted: approval.argsJson,
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        })
      : undefined;

    const { messages, requestHints } = decodeApprovalState({
      state: approval.state,
    });

    const resumeContext: SlackMessageContext = {
      botUserId: context.botUserId,
      client,
      teamId: approval.teamId ?? body.team?.id,
      event: {
        channel: approval.channelId,
        event_ts: approval.eventTs,
        text: '',
        thread_ts: approval.threadTs,
        ts: approval.eventTs,
        user: approval.userId,
      },
    };

    if (approved && alwaysInThread) {
      await upsertMcpToolPermission({
        mode: 'allow',
        scope: 'thread',
        serverId: approval.serverId,
        source: 'user',
        teamId: approval.teamId,
        threadTs: approval.threadTs,
        toolName: approval.toolName,
        userId: approval.userId,
      });
    }

    await updateMcpToolApproval({
      approvalId,
      userId: body.user.id,
      values: { status: approved ? 'approved' : 'denied' },
    });
    await updateApprovalMessage({ ...args, input, text: resultText });

    getQueue(getContextId(resumeContext))
      .add(() =>
        resumeResponse({
          approvalId,
          approved,
          context: resumeContext,
          messages,
          reason: approved ? undefined : 'Access denied by Slack approval.',
          requestHints,
        })
      )
      .catch((error: unknown) => {
        logger.error(
          { err: error, approvalId },
          'Failed to resume MCP approval'
        );
      });
  } catch (error) {
    await updateMcpToolApproval({
      approvalId,
      userId: body.user.id,
      values: { status: 'pending' },
    });
    throw error;
  }
}
