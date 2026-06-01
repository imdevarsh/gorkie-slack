import { createMcpToolApproval } from '@repo/db/queries';
import { decryptSecret, encryptSecret } from '@repo/utils';
import { getErrorDetails } from '@repo/utils/error';
import { clampText } from '@repo/utils/text';
import {
  type ModelMessage,
  NoOutputGeneratedError,
  type UserContent,
} from 'ai';
import { env } from '@/env';
import { clearAbortController, createAbortController } from '@/lib/abort';
import {
  consumeOrchestratorReasoningStream,
  orchestratorAgent,
  resolveOrchestratorTask,
  type ToolApprovalRequest,
} from '@/lib/ai/agents/orchestrator';
import { setStatus } from '@/lib/ai/utils/status';
import { closeStream, initStream, setPlanTitle } from '@/lib/ai/utils/stream';
import { updateTask } from '@/lib/ai/utils/task';
import { setConversationTitle } from '@/lib/ai/utils/title';
import { actions } from '@/slack/features/customizations/mcp/ids';
import type { ChatRequestHints, SlackMessageContext, Stream } from '@/types';
import { getContextId } from '@/utils/context';
import { processSlackFiles } from '@/utils/images';
import { getSlackUser } from '@/utils/users';

async function postApprovalRequest({
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
  const inputBody = `Input:\n\`\`\`${args || '{}'}\`\`\``;

  await createMcpToolApproval({
    approvalId: approval.approvalId,
    argsJson: encryptSecret({
      plaintext: clampText(args, 8000),
      secret: env.MCP_TOKEN_ENCRYPTION_KEY,
    }),
    channelId: channel,
    eventTs: context.event.event_ts,
    exposedName: approval.exposedName,
    messagesJson: encryptSecret({
      plaintext: JSON.stringify(messages),
      secret: env.MCP_TOKEN_ENCRYPTION_KEY,
    }),
    requestHintsJson: encryptSecret({
      plaintext: JSON.stringify(requestHints),
      secret: env.MCP_TOKEN_ENCRYPTION_KEY,
    }),
    serverId: approval.serverId,
    status: 'pending',
    teamId: context.teamId,
    threadTs,
    toolCallId: approval.toolCallId,
    toolName: approval.toolName,
    userId: context.event.user ?? '',
  });

  await context.client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `Approve ${approval.serverName} ${approval.toolName}`,
    blocks: [
      {
        type: 'card',
        title: {
          type: 'mrkdwn',
          text: `Approve: ${approval.serverName} · ${approval.toolName}`,
        },
        body: {
          type: 'mrkdwn',
          text: clampText(inputBody, 200),
        },
        actions: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Approve once' },
            style: 'primary',
            action_id: actions.approvalApprove,
            value: approval.approvalId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Always in thread' },
            action_id: actions.approvalAlwaysThread,
            value: approval.approvalId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Deny' },
            style: 'danger',
            action_id: actions.approvalDeny,
            value: approval.approvalId,
          },
        ],
      },
    ],
  });
}

async function recordApprovalTask({
  approval,
  stream,
}: {
  approval: ToolApprovalRequest;
  stream: Stream;
}) {
  let input = 'Input: undefined';
  try {
    input = `Input:\n${
      JSON.stringify(approval.input, null, 2) ?? String(approval.input)
    }`;
  } catch {
    input = `Input:\n${String(approval.input)}`;
  }

  await updateTask(stream, {
    taskId: approval.toolCallId,
    title: `Using ${approval.serverName} MCP: ${approval.toolName}`,
    details: clampText(input, 1200),
    status: 'complete',
    output: 'Approval needed',
  });
}

async function runAgent({
  context,
  files,
  messages,
  requestHints,
}: {
  context: SlackMessageContext;
  files?: Parameters<typeof orchestratorAgent>[0]['files'];
  messages: ModelMessage[];
  requestHints: ChatRequestHints;
}) {
  const ctxId = getContextId(context);
  const controller = createAbortController(ctxId);
  let stream: Stream | null = null;

  try {
    stream = await initStream(context);
    const agent = await orchestratorAgent({
      context,
      requestHints,
      files,
      stream,
    });

    const streamResult = await agent.stream({
      messages,
      abortSignal: controller.signal,
    });
    const approvals = await consumeOrchestratorReasoningStream({
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
    if ((error as Error)?.name === 'AbortError') {
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
    clearAbortController(ctxId);
  }
}

export async function resumeResponse({
  approved,
  context,
  messages,
  requestHints,
  approvalId,
  reason,
}: {
  approved: boolean;
  approvalId: string;
  context: SlackMessageContext;
  messages: ModelMessage[];
  requestHints: ChatRequestHints;
  reason?: string;
}) {
  await setStatus(context, {
    status: approved ? 'is continuing' : 'is handling the denial',
  });
  return runAgent({
    context,
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

export function decodeApprovalPayload({
  messagesJson,
  requestHintsJson,
}: {
  messagesJson: string;
  requestHintsJson: string;
}) {
  return {
    messages: JSON.parse(
      decryptSecret({
        encrypted: messagesJson,
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
      })
    ) as ModelMessage[],
    requestHints: JSON.parse(
      decryptSecret({
        encrypted: requestHintsJson,
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
      })
    ) as ChatRequestHints,
  };
}

export async function generateResponse(
  context: SlackMessageContext,
  messages: ModelMessage[],
  requestHints: ChatRequestHints
) {
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
        ? ([
            { type: 'text', text: replyPrompt },
            ...imageContents,
          ] as UserContent)
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
