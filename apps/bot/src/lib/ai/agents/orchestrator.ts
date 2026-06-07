import { systemPrompt } from '@repo/ai/prompts';
import { provider } from '@repo/ai/providers';
import { successToolCall } from '@repo/ai/tools';
import { stepCountIs, ToolLoopAgent } from 'ai';
import { createToolset } from '@/lib/ai/tools';
import logger from '@/lib/logger';
import type {
  ChatRequestHints,
  OrchestratorStreamPart,
  SlackFile,
  SlackMessageContext,
  Stream,
  ToolApprovalRequest,
} from '@/types';
import { createTask, finishTask } from '../utils/task';

const taskMap = new Map<string, { startTime: number; taskId: string }>();

export async function resolveOrchestratorTask({
  context,
  stream,
  title,
  details,
}: {
  context: SlackMessageContext;
  stream: Stream;
  title?: string;
  details?: string;
}): Promise<void> {
  const eventTs = context.event.event_ts;
  const entry = taskMap.get(eventTs);
  if (!entry) {
    return;
  }

  const elapsedMs = Date.now() - entry.startTime;
  const elapsedLabel =
    elapsedMs < 1000 ? '<1s' : `${Math.round(elapsedMs / 1000)}s`;
  const resolvedTitle = title ?? `Thought for ${elapsedLabel}`;

  await finishTask(stream, {
    taskId: entry.taskId,
    status: 'complete',
    title: resolvedTitle,
    ...(details ? { details } : {}),
  });
  taskMap.delete(eventTs);
}

export async function consumeOrchestratorStream({
  fullStream,
}: {
  context: SlackMessageContext;
  stream: Stream;
  fullStream: AsyncIterable<OrchestratorStreamPart>;
}): Promise<ToolApprovalRequest[]> {
  const approvals: ToolApprovalRequest[] = [];

  for await (const part of fullStream) {
    if (part.type === 'tool-approval-request' && 'toolCall' in part) {
      const mcp = part.toolCall.toolMetadata?.mcp;
      if (mcp?.serverId && mcp.serverName && mcp.toolName) {
        approvals.push({
          approvalId: part.approvalId,
          input: part.toolCall.input,
          serverId: mcp.serverId,
          serverName: mcp.serverName,
          toolCallId: part.toolCall.toolCallId,
          toolName: mcp.toolName,
        });
      }
    }
  }

  return approvals;
}

export const orchestratorAgent = async ({
  context,
  requestHints,
  files,
  stream,
}: {
  context: SlackMessageContext;
  requestHints: ChatRequestHints;
  files?: SlackFile[];
  stream: Stream;
}): Promise<{ agent: ToolLoopAgent; cleanup: () => Promise<void> }> => {
  const { cleanup, tools } = await createToolset({ context, files, stream });
  const agent = new ToolLoopAgent({
    model: provider.languageModel('chat-model'),
    instructions: systemPrompt({
      agent: 'chat',
      requestHints,
      context,
    }),
    providerOptions: {
      openrouter: {
        reasoning: { enabled: true, exclude: false, effort: 'medium' },
      },
      google: {
        thinkingConfig: {
          thinkingLevel: 'medium',
          includeThoughts: true,
        },
      },
    },
    toolChoice: 'required',
    tools,
    stopWhen: [
      stepCountIs(40),
      successToolCall('leaveChannel'),
      successToolCall('reply'),
      successToolCall('skip'),
    ],
    async prepareStep() {
      const taskId = crypto.randomUUID();
      await createTask(stream, {
        taskId,
        title: 'Thinking…',
        status: 'in_progress',
      });
      taskMap.set(context.event.event_ts, {
        taskId,
        startTime: Date.now(),
      });
      return {};
    },
    async onStepFinish() {
      const entry = taskMap.get(context.event.event_ts);
      if (entry) {
        await resolveOrchestratorTask({ context, stream });
        return;
      }

      logger.warn(
        { eventTs: context.event.event_ts },
        'No taskId found in taskMap'
      );
    },
    onFinish() {
      taskMap.delete(context.event.event_ts);
    },
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'orchestrator',
    },
  });
  return { agent, cleanup };
};
