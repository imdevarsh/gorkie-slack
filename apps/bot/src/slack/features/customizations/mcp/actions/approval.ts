import {
  claimMCPToolApproval,
  finalizeMCPToolApprovalInBatch,
  getMCPServerById,
  getMCPToolApprovalStatus,
  patchMCPToolModes,
  reopenMCPToolApprovals,
  updateMCPToolApproval,
} from '@repo/db/queries';
import { asRecord } from '@repo/utils/record';
import logger from '@/lib/logger';
import { decrypt } from '@/lib/mcp/encryption';
import { getQueue } from '@/lib/queue';
import {
  type ApprovalOutcome,
  activeApprovalBlocks,
  decodeApprovalState,
  handledApprovalBlocks,
} from '@/slack/events/message-create/utils/approval-helpers';
import { resumeResponse } from '@/slack/events/message-create/utils/resume';
import type { SlackMessageContext } from '@/types';
import { getContextId } from '@/utils/context';
import { replyCard, replyFromActionId, replyStatus } from '../reply';
import type { ButtonArgs } from '../types';

async function updateApprovalMessage({
  body,
  client,
  input,
  serverName,
  text,
  title,
  toolName,
}: ButtonArgs & {
  input?: string;
  serverName?: string;
  text: string;
  title: string;
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
      blocks: handledApprovalBlocks({
        input,
        serverName,
        text,
        title,
        toolName,
      }),
    })
    .catch(() => undefined);
}

// When the post-approval resume fails, the batch is already finalized — so the
// buttons would render "Already handled" and the run would be lost. Reopen the
// batch to 'pending' and restore each card's actionable blocks so the user can
// respond again. Never throws; recovery must not deadlock on its own failure.
async function recoverFromResumeFailure({
  approvalIds,
  resumeContext,
  userId,
}: {
  approvalIds: string[];
  resumeContext: SlackMessageContext;
  userId: string;
}): Promise<void> {
  const reopened = await reopenMCPToolApprovals({ approvalIds, userId });
  await Promise.all(
    reopened.map(async (item) => {
      if (!item.messageTs) {
        return;
      }
      const server = await getMCPServerById({ id: item.serverId, userId });
      await resumeContext.client.chat
        .update({
          channel: item.channelId,
          ts: item.messageTs,
          text: `Approve ${server?.name ?? item.toolName}: ${item.toolName}`,
          blocks: activeApprovalBlocks({
            approvalId: item.approvalId,
            input: item.args ? decrypt(item.args) : '',
            serverName: server?.name ?? item.toolName,
            toolName: item.toolName,
          }),
        })
        .catch(() => undefined);
    })
  );
  await resumeContext.client.chat
    .postMessage({
      channel: resumeContext.event.channel,
      thread_ts: resumeContext.event.thread_ts ?? undefined,
      text: 'Resuming after your approval failed. The approval buttons are active again — please respond once more.',
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

  const status = await getMCPToolApprovalStatus({ approvalId });

  if (status && status.userId !== body.user.id) {
    const container = asRecord(body.container);
    const channel = container?.channel_id;
    if (typeof channel === 'string') {
      await client.chat
        .postEphemeral({
          channel,
          text: "You don't have permission to respond to this approval request.",
          user: body.user.id,
        })
        .catch(() => undefined);
    }
    return;
  }

  if (!status || status.status !== 'pending') {
    const server = status
      ? await getMCPServerById({
          id: status.serverId,
          userId: body.user.id,
        })
      : null;
    await updateApprovalMessage({
      ...args,
      serverName: server?.name ?? status?.toolName,
      text:
        status?.status === 'superseded'
          ? 'Replaced by a newer message.'
          : 'Already handled.',
      title:
        status?.status === 'superseded'
          ? 'Approval Expired'
          : 'Already handled',
      toolName: status?.toolName,
    });
    return;
  }

  const reply = replyFromActionId(action.action_id);
  const approval = await claimMCPToolApproval({
    approvalId,
    userId: body.user.id,
  });
  if (!approval) {
    const server = await getMCPServerById({
      id: status.serverId,
      userId: body.user.id,
    });
    await updateApprovalMessage({
      ...args,
      serverName: server?.name ?? status.toolName,
      text: 'Already handled.',
      title: 'Already handled',
      toolName: status.toolName,
    });
    return;
  }

  const server = await getMCPServerById({
    id: approval.serverId,
    userId: body.user.id,
  });
  const serverName = server?.name ?? approval.toolName;

  if (reply !== 'reject' && !server?.enabled) {
    await updateApprovalMessage({
      ...args,
      serverName,
      text: 'Server is no longer connected. Approval cancelled.',
      title: 'Disconnected',
      toolName: approval.toolName,
    });
    await updateMCPToolApproval({
      approvalId,
      userId: body.user.id,
      values: { status: 'denied' },
    });
    return;
  }

  const { text: resultText, title: resultTitle } = replyCard(reply);

  let input: string | undefined;
  try {
    input = approval.args ? decrypt(approval.args) : undefined;

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

    if (reply === 'always' && approval.threadTs) {
      await patchMCPToolModes({
        modes: { [approval.toolName]: 'allow' },
        scope: 'thread',
        serverId: approval.serverId,
        teamId: approval.teamId,
        threadTs: approval.threadTs,
        userId: approval.userId,
      });
    }

    const batch = await finalizeMCPToolApprovalInBatch({
      approvalId,
      status: replyStatus(reply),
      userId: body.user.id,
    });
    await updateApprovalMessage({
      ...args,
      input,
      serverName,
      text: resultText,
      title: resultTitle,
      toolName: approval.toolName,
    });

    // Parallel tool calls raise a batch of approvals for one turn; the run can
    // only resume once every sibling is answered. Superseded siblings count as
    // denied so a new message doesn't permanently deadlock the batch.
    if (!batch.batchComplete) {
      return;
    }
    const approvals: ApprovalOutcome[] = batch.siblings.map((s) => ({
      approvalId: s.approvalId,
      reply: s.status === 'approved' ? 'once' : 'reject',
    }));

    getQueue(getContextId(resumeContext))
      .add(() =>
        resumeResponse({
          approvals,
          context: resumeContext,
          messages,
          requestHints,
        })
      )
      .catch((error: unknown) => {
        logger.error(
          { err: error, approvalId },
          'Failed to resume MCP approval'
        );
        recoverFromResumeFailure({
          approvalIds: batch.siblings.map((s) => s.approvalId),
          resumeContext,
          userId: body.user.id,
        }).catch((recoveryError: unknown) => {
          logger.error(
            { err: recoveryError, approvalId },
            'Failed to reopen approval batch after resume failure'
          );
        });
      });
  } catch (error) {
    await updateMCPToolApproval({
      approvalId,
      userId: body.user.id,
      values: { status: 'pending' },
    });
    throw error;
  }
}
