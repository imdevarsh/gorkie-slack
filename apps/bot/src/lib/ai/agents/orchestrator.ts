import { systemPrompt } from '@repo/ai/prompts';
import { provider } from '@repo/ai/providers';
import { successToolCall } from '@repo/ai/tools';
import { stepCountIs, ToolLoopAgent } from 'ai';
import { createToolset } from '@/lib/ai/tools/toolset';
import logger from '@/lib/logger';
import type {
  ChatRequestHints,
  SlackFile,
  SlackMessageContext,
  Stream,
} from '@/types';
import { createTask, finishTask, updateTask } from '../utils/task';

type ReasoningStreamPart =
  | { type: 'start-step' }
  | { type: 'reasoning-delta'; text: string }
  | { type: string };

export function orchestratorAgent({
  context,
  requestHints,
  files,
  stream,
}: {
  context: SlackMessageContext;
  requestHints: ChatRequestHints;
  files?: SlackFile[];
  stream: Stream;
}) {
  const taskMap = new Map<string, { taskId: string; startTime: number }>();
  const eventTs = context.event.event_ts;

  async function resolveTask({
    title,
    details,
  }: {
    title?: string;
    details?: string;
  } = {}): Promise<void> {
    const entry = taskMap.get(eventTs);
    if (!entry) {
      return;
    }

    const elapsedMs = Date.now() - entry.startTime;
    const elapsedLabel =
      elapsedMs < 1000 ? '<1s' : `${Math.round(elapsedMs / 1000)}s`;

    await finishTask(stream, {
      taskId: entry.taskId,
      status: 'complete',
      title: title ?? `Thought for ${elapsedLabel}`,
      ...(details ? { details } : {}),
    });
  }

  async function consumeReasoningStream(
    fullStream: AsyncIterable<ReasoningStreamPart>
  ): Promise<void> {
    for await (const part of fullStream) {
      if (part.type === 'start-step') {
        continue;
      }

      if (part.type !== 'reasoning-delta' || !('text' in part)) {
        continue;
      }

      const reasoningSummary = String(part.text)
        .trim()
        .split('\n')
        .filter(Boolean)
        .filter((line) => line !== '[REDACTED]')
        .join('\n');

      if (!reasoningSummary) {
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
        output: `\n${reasoningSummary}`,
      });
    }
  }

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
      taskMap.set(eventTs, { taskId, startTime: Date.now() });
      return {};
    },
    async onStepFinish() {
      const entry = taskMap.get(eventTs);
      if (entry) {
        await resolveTask();
        return;
      }
      logger.warn({ eventTs }, 'No taskId found in taskMap');
    },
    onFinish() {
      taskMap.delete(eventTs);
    },
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'orchestrator',
    },
  });

  return { agent, resolveTask, consumeReasoningStream };
}
