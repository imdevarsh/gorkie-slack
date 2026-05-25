import {
  provider,
  stepCountIs,
  successToolCall,
  ToolLoopAgent,
} from '@repo/ai';
import { systemPrompt } from '@repo/ai/prompts';
import { createToolset } from '@/lib/ai/tools/toolset';
import logger from '@/lib/logger';
import type {
  ChatRequestHints,
  SlackFile,
  SlackMessageContext,
  Stream,
} from '@/types';
import { createTask, finishTask } from '../utils/task';

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
  let pendingReasoning = '';

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

    const reasoning = pendingReasoning
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && line !== '[REDACTED]')
      .join('\n');
    pendingReasoning = '';

    await finishTask(stream, {
      taskId: entry.taskId,
      status: 'complete',
      title: title ?? `Thought for ${elapsedLabel}`,
      ...(details ? { details } : {}),
      ...(reasoning ? { output: reasoning } : {}),
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

      pendingReasoning += String(part.text);
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
