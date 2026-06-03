import {
  claimMcpToolApproval,
  getMcpServerByIdForUser,
  getMcpToolApprovalStatus,
  updateMcpToolApproval,
  upsertMcpToolPermission,
} from '@repo/db/queries';
import { decryptSecret } from '@repo/utils';
import { asRecord } from '@repo/utils/record';
import { env } from '@/env';
import logger from '@/lib/logger';
import { getQueue } from '@/lib/queue';
import {
  decodeApprovalState,
  handledApprovalBlocks,
} from '@/slack/events/message-create/utils/approval-helpers';
import { resumeResponse } from '@/slack/events/message-create/utils/respond';
import type { SlackMessageContext } from '@/types';
import { getContextId } from '@/utils/context';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';

export const approveName = actions.approval.allow;
export const alwaysThreadName = actions.approval.always;
export const denyName = actions.approval.deny;

async function updateApprovalMessage({
  body,
  client,
  input,
  serverName,
  text,
  toolName,
}: ButtonArgs & {
  input?: string;
  serverName?: string;
  text: string;
  toolName?: string;
}) {
  const container = asRecord(body.container);
  const message = asRecord(body.message);
  const channel = container?.channel_id;
  const ts = message?.ts;
  if (!(typeof channel === 'string' && typeof ts === 'string')) {
    return;
  }

  await client.chat
    .update({
      channel,
      ts,
      text,
      blocks: handledApprovalBlocks({ input, serverName, text, toolName }),
    })
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
    const server = status
      ? await getMcpServerByIdForUser({
          id: status.serverId,
          userId: body.user.id,
        })
      : null;
    await updateApprovalMessage({
      ...args,
      serverName: server?.name ?? status?.exposedName,
      text:
        status?.status === 'superseded'
          ? 'Approval expired because you sent a newer message.'
          : 'This MCP approval request has already been handled.',
      toolName: status?.toolName,
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
    const server = await getMcpServerByIdForUser({
      id: status.serverId,
      userId: body.user.id,
    });
    await updateApprovalMessage({
      ...args,
      serverName: server?.name ?? status.exposedName,
      text: 'This MCP approval request has already been handled.',
      toolName: status.toolName,
    });
    return;
  }

  const server = await getMcpServerByIdForUser({
    id: approval.serverId,
    userId: body.user.id,
  });
  const serverName = server?.name ?? approval.exposedName;
  let resultText = 'Access denied.';
  if (approved) {
    resultText = alwaysInThread
      ? 'Approved for this thread.'
      : 'Approved once.';
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
    await updateApprovalMessage({
      ...args,
      input,
      serverName,
      text: resultText,
      toolName: approval.toolName,
    });

    getQueue(getContextId(resumeContext))
      .add(() =>
        resumeResponse({
          approvalId,
          approved,
          context: resumeContext,
          deniedApproval: approved
            ? undefined
            : {
                approvalId,
                exposedName: approval.exposedName,
                input: input ?? '',
                serverId: approval.serverId,
                serverName,
                toolCallId: approval.toolCallId,
                toolName: approval.toolName,
              },
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
