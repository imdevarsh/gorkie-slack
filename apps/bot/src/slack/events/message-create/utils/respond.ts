import {
  getMcpServerByIdForUser,
  supersedePendingMcpToolApprovals,
} from '@repo/db/queries';
import { getErrorDetails } from '@repo/utils/error';
import {
  type ModelMessage,
  NoOutputGeneratedError,
  type UserContent,
} from 'ai';
import { clearAbortController, createAbortController } from '@/lib/abort';
import {
  collectToolApprovalsFromStream,
  orchestratorAgent,
  resolveOrchestratorTask,
} from '@/lib/ai/agents/orchestrator';
import { setStatus } from '@/lib/ai/utils/status';
import { closeStream, initStream, setPlanTitle } from '@/lib/ai/utils/stream';
import { finishTask } from '@/lib/ai/utils/task';
import { setConversationTitle } from '@/lib/ai/utils/title';
import type {
  ChatRequestHints,
  SlackMessageContext,
  Stream,
  ToolApprovalRequest,
} from '@/types';
import { getContextId } from '@/utils/context';
import { processSlackFiles } from '@/utils/images';
import { getSlackUser } from '@/utils/users';
import {
  handledApprovalBlocks,
  postApprovalRequest,
  recordApprovalTask,
} from './approval-helpers';

async function runAgent({
  context,
  deniedApproval,
  files,
  messages,
  requestHints,
}: {
  context: SlackMessageContext;
  deniedApproval?: ToolApprovalRequest;
  files?: Parameters<typeof orchestratorAgent>[0]['files'];
  messages: ModelMessage[];
  requestHints: ChatRequestHints;
}) {
  const ctxId = getContextId(context);
  const controller = createAbortController(ctxId);
  let stream: Stream | null = null;
  let cleanup: (() => Promise<void>) | null = null;

  try {
    stream = await initStream(context);
    if (deniedApproval) {
      await finishTask(stream, {
        taskId: deniedApproval.toolCallId,
        title: `Using ${deniedApproval.serverName} MCP: ${deniedApproval.toolName}`,
        status: 'complete',
        output: 'Access denied by Slack approval.',
      });
    }
    const result = await orchestratorAgent({
      context,
      requestHints,
      files,
      stream,
    });
    cleanup = result.cleanup;

    const streamResult = await result.agent.stream({
      messages,
      abortSignal: controller.signal,
    });
    const approvals = await collectToolApprovalsFromStream({
      context,
      stream,
      fullStream: streamResult.fullStream,
    });
    const response = await streamResult.response;
    const responseMessages = [...messages, ...response.messages];

    if (approvals.length > 0) {
      const activeStream = stream;
      await setPlanTitle(stream, 'Needs Approval');
      await resolveOrchestratorTask({
        context,
        stream,
        title: 'Needs Approval',
        details: 'Paused until you approve or deny the MCP tool call.',
      });
      await Promise.all(
        approvals.map(async (approval) => {
          await recordApprovalTask({ approval, stream: activeStream });
          await postApprovalRequest({
            approval,
            context,
            messages: responseMessages,
            requestHints,
          });
        })
      );
    }

    const toolCalls = await streamResult.toolCalls;
    await closeStream(stream);
    await setStatus(context, { status: '' });
    return { success: true, toolCalls };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (stream) {
        await setPlanTitle(stream, 'Interrupted');
        await resolveOrchestratorTask({
          context,
          stream,
          title: 'Interrupted',
          details: 'Stopped by user.',
        });
        await closeStream(stream);
      }
      await setStatus(context, { status: '' });
      return { success: false };
    }

    const errorDetails = getErrorDetails(error);
    const detailParts = [errorDetails.name];
    if (errorDetails.statusCode !== undefined) {
      detailParts.push(`status ${errorDetails.statusCode}`);
    }
    if (errorDetails.code) {
      detailParts.push(`code ${errorDetails.code}`);
    }
    const failureDetails = `${detailParts.join(' | ')}: ${errorDetails.message}`;

    if (stream) {
      await setPlanTitle(stream, 'Generation Failed');
      await resolveOrchestratorTask({
        context,
        stream,
        title: 'Generation Failed',
        details: failureDetails,
      });
      await closeStream(stream);
    }
    await setStatus(context, { status: 'failed to generate' });
    return {
      success: false,
      error:
        error instanceof NoOutputGeneratedError
          ? 'Oops! Gorkie is out of credits right now. Please try again later.'
          : 'Oops! Something went wrong, try again later.',
    };
  } finally {
    await cleanup?.().catch(() => undefined);
    clearAbortController(ctxId);
  }
}

export async function resumeResponse({
  approved,
  context,
  deniedApproval,
  messages,
  requestHints,
  approvalId,
  reason,
}: {
  approved: boolean;
  approvalId: string;
  context: SlackMessageContext;
  deniedApproval?: ToolApprovalRequest;
  messages: ModelMessage[];
  requestHints: ChatRequestHints;
  reason?: string;
}) {
  await setStatus(context, {
    status: approved ? 'is continuing' : 'is handling the denial',
  });
  return runAgent({
    context,
    deniedApproval,
    messages: [
      ...messages,
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId,
            approved,
            ...(reason ? { reason } : {}),
          },
        ],
      },
    ],
    requestHints,
  });
}

export async function generateResponse({
  context,
  messages,
  requestHints,
}: {
  context: SlackMessageContext;
  messages: ModelMessage[];
  requestHints: ChatRequestHints;
}) {
  try {
    await setStatus(context, {
      status: 'is thinking',
      loading: [
        'is pondering your question',
        'is working on it',
        'is putting thoughts together',
        'is mulling this over',
        'is figuring this out',
        'is cooking up a response',
        'is connecting the dots',
        'is working through this',
        'is piecing things together',
        'is giving it a good think',
      ],
    });

    const userId = context.event.user;
    const messageText = context.event.text ?? '';
    const channelId = context.event.channel;
    if (userId && channelId) {
      const expiredApprovals = await supersedePendingMcpToolApprovals({
        channelId,
        threadTs:
          context.event.channel_type === 'im'
            ? null
            : (context.event.thread_ts ?? context.event.ts),
        userId,
      });
      await Promise.all(
        expiredApprovals.map(async (approval) => {
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
                toolName: approval.toolName,
              }),
            })
            .catch(() => undefined);
        })
      );
    }

    if (messages.length === 0) {
      setConversationTitle(context, messageText).catch(() => undefined);
    }
    const files = context.event.files;
    const authorName = userId
      ? (await getSlackUser(context.client, userId)).name
      : 'user';

    const imageContents = await processSlackFiles(files);

    const replyPrompt = `You are replying to the following message from ${authorName} (${userId}): ${messageText}`;

    const currentMessageContent: UserContent =
      imageContents.length > 0
        ? [{ type: 'text', text: replyPrompt }, ...imageContents]
        : replyPrompt;

    return await runAgent({
      context,
      files,
      messages: [
        ...messages,
        {
          role: 'user',
          content: currentMessageContent,
        },
      ],
      requestHints,
    });
  } catch (error) {
    await setStatus(context, { status: 'failed to generate' });
    return {
      success: false,
      error:
        error instanceof NoOutputGeneratedError
          ? 'Oops! Gorkie is out of credits right now. Please try again later.'
          : 'Oops! Something went wrong, try again later.',
    };
  }
}
