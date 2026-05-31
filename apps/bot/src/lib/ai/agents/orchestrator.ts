import { systemPrompt } from '@repo/ai/prompts';
import { provider } from '@repo/ai/providers';
import { successToolCall } from '@repo/ai/tools';
import { stepCountIs, ToolLoopAgent } from 'ai';
import { createToolset } from '@/lib/ai/tools';
import logger from '@/lib/logger';
import type {
  ChatRequestHints,
  SlackFile,
  SlackMessageContext,
  Stream,
} from '@/types';
import { createTask, finishTask, updateTask } from '../utils/task';

const taskMap = new Map<string, { taskId: string; startTime: number }>();

type ReasoningStreamPart =
  | { type: 'start-step' }
  | { type: 'reasoning-delta'; text: string }
  | { type: string };

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

export async function consumeOrchestratorReasoningStream({
  context,
  stream,
  fullStream,
}: {
  context: SlackMessageContext;
  stream: Stream;
  fullStream: AsyncIterable<ReasoningStreamPart>;
}): Promise<void> {
  const eventTs = context.event.event_ts;

  for await (const part of fullStream) {
    if (part.type === 'start-step') {
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
      logger.warn({ eventTs }, 'No taskId found in taskMap');
      continue;
    }

    await updateTask(stream, {
      taskId: entry.taskId,
      status: 'in_progress',
      output: part.text,
    });
  }
}

export const orchestratorAgent = ({
  context,
  requestHints,
  files,
  stream,
}: {
  context: SlackMessageContext;
  requestHints: ChatRequestHints;
  files?: SlackFile[];
  stream: Stream;
}) =>
  new ToolLoopAgent({
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
    tools: createToolset({ context, files, stream }),
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
      taskMap.set(context.event.event_ts, { taskId, startTime: Date.now() });
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
