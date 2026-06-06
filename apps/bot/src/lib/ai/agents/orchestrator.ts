import { systemPrompt } from '@repo/ai/prompts';
import { provider } from '@repo/ai/providers';
import { successToolCall } from '@repo/ai/tools';
import { clampText } from '@repo/utils/text';
import { stepCountIs, ToolLoopAgent } from 'ai';
import { orchestratorStream } from '@/config';
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
import { createTask, finishTask, updateTask } from '../utils/task';

interface OrchestratorTaskEntry {
  lastFlushAt: number;
  lastFlushedLength: number;
  reasoning: string;
  startTime: number;
  taskId: string;
}

const taskMap = new Map<string, OrchestratorTaskEntry>();

async function flushReasoningTask({
  entry,
  force = false,
  stream,
}: {
  entry: OrchestratorTaskEntry;
  force?: boolean;
  stream: Stream;
}): Promise<void> {
  const details = clampText(
    entry.reasoning.replaceAll('[REDACTED]', ''),
    orchestratorStream.reasoningDetailsMaxChars
  );
  if (!details) {
    return;
  }

  const now = Date.now();
  const shouldFlush =
    force ||
    (now - entry.lastFlushAt >= orchestratorStream.reasoningFlushIntervalMs &&
      entry.reasoning.length - entry.lastFlushedLength >=
        orchestratorStream.reasoningFlushMinChars);
  if (!shouldFlush) {
    return;
  }

  entry.lastFlushAt = now;
  entry.lastFlushedLength = entry.reasoning.length;
  const status =
    stream.tasks.get(entry.taskId)?.status === 'complete'
      ? 'complete'
      : 'in_progress';
  await updateTask(stream, {
    taskId: entry.taskId,
    status,
    details,
  });
}

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
}

export async function consumeOrchestratorStream({
  context,
  stream,
  fullStream,
}: {
  context: SlackMessageContext;
  stream: Stream;
  fullStream: AsyncIterable<OrchestratorStreamPart>;
}): Promise<ToolApprovalRequest[]> {
  const eventTs = context.event.event_ts;
  const approvals: ToolApprovalRequest[] = [];
  let missingTaskWarned = false;

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
      continue;
    }

    if (part.type === 'start-step') {
      continue;
    }

    if (part.type === 'reasoning-end' || part.type === 'finish-step') {
      const entry = taskMap.get(eventTs);
      if (entry) {
        await flushReasoningTask({ entry, force: true, stream });
      }
      continue;
    }

    if (part.type !== 'reasoning-delta' || !('text' in part)) {
      continue;
    }

    if (!part.text) {
      continue;
    }

    const entry = taskMap.get(eventTs);
    if (!entry) {
      if (!missingTaskWarned) {
        logger.warn({ eventTs }, 'No task ID found for reasoning stream');
        missingTaskWarned = true;
      }
      continue;
    }

    entry.reasoning += part.text;
    await flushReasoningTask({ entry, stream });
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
        lastFlushedLength: 0,
        lastFlushAt: 0,
        reasoning: '',
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
