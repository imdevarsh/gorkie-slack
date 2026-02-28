import { stepCountIs, ToolLoopAgent } from 'ai';
import { systemPrompt } from '~/lib/ai/prompts';
import { provider } from '~/lib/ai/providers';
import { generateImageTool } from '~/lib/ai/tools/chat/generate-image';
import { getUserInfo } from '~/lib/ai/tools/chat/get-user-info';
import { getWeather } from '~/lib/ai/tools/chat/get-weather';
import { leaveChannel } from '~/lib/ai/tools/chat/leave-channel';
import { mermaid } from '~/lib/ai/tools/chat/mermaid';
import { react } from '~/lib/ai/tools/chat/react';
import { reply } from '~/lib/ai/tools/chat/reply';
import { sandbox } from '~/lib/ai/tools/chat/sandbox';
import { scheduleReminder } from '~/lib/ai/tools/chat/schedule-reminder';
import { searchSlack } from '~/lib/ai/tools/chat/search-slack';
import { searchWeb } from '~/lib/ai/tools/chat/search-web';
import { skip } from '~/lib/ai/tools/chat/skip';
import { summariseThread } from '~/lib/ai/tools/chat/summarise-thread';
import { successToolCall } from '~/lib/ai/utils';
import logger from '~/lib/logger';
import type {
  ChatRequestHints,
  SlackFile,
  SlackMessageContext,
  Stream,
} from '~/types';
import { createTask, finishTask, updateTask } from '../utils/task';

const taskMap = new Map<string, string>();
const taskStartedMap = new Map<string, boolean>();

type ReasoningStreamPart =
  | { type: 'start-step' }
  | { type: 'reasoning-delta'; text: string }
  | { type: string };

function normalizeReasoning(reasoningText: unknown): string {
  return String(reasoningText)
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((line) => line !== '[REDACTED]')
    .join('\n');
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

    const reasoningSummary = normalizeReasoning(part.text);
    if (!reasoningSummary) {
      continue;
    }

    const taskId = taskMap.get(eventTs);
    if (!taskId) {
      logger.warn({ eventTs }, 'No taskId found in taskMap');
      continue;
    }

    await updateTask(stream, {
      taskId,
      status: 'in_progress',
      output: '\n' + reasoningSummary,
    });
    taskStartedMap.set(eventTs, true);
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
    },
    toolChoice: 'required',
    tools: {
      getWeather: getWeather({ context, stream }),
      generateImage: generateImageTool({ context, files, stream }),
      searchWeb: searchWeb({ context, stream }),
      searchSlack: searchSlack({ context, stream }),
      getUserInfo: getUserInfo({ context, stream }),
      leaveChannel: leaveChannel({ context, stream }),
      scheduleReminder: scheduleReminder({ context, stream }),
      summariseThread: summariseThread({ context, stream }),
      sandbox: sandbox({ context, files, stream }),
      mermaid: mermaid({ context, stream }),
      react: react({ context, stream }),
      reply: reply({ context, stream }),
      skip: skip({ context, stream }),
    },
    stopWhen: [
      stepCountIs(25),
      successToolCall('leaveChannel'),
      successToolCall('reply'),
      successToolCall('skip'),
    ],
    async prepareStep() {
      const taskId = crypto.randomUUID();
      const task = await createTask(stream, {
        taskId,
        title: 'Thinking',
        status: 'in_progress',
      });
      taskMap.set(context.event.event_ts, task);
      taskStartedMap.set(context.event.event_ts, false);
      return {};
    },
    async experimental_onToolCallStart({ toolCall }) {
      if (taskStartedMap.get(context.event.event_ts)) {
        return;
      }

      const taskId = taskMap.get(context.event.event_ts);
      if (taskId) {
        const toolTitle =
          typeof toolCall.title === 'string' ? toolCall.title.trim() : '';
        const reasoningSummary =
          toolTitle || `Preparing to run ${toolCall.toolName}`;
        await finishTask(stream, {
          status: 'complete',
          taskId,
          output: reasoningSummary,
        });
        taskStartedMap.set(context.event.event_ts, true);
        return;
      }

      logger.warn(
        { eventTs: context.event.event_ts },
        'No taskId found in taskMap'
      );
    },
    async onStepFinish({ reasoningText }) {
      const taskId = taskMap.get(context.event.event_ts);
      if (taskId) {
        await finishTask(stream, {
          status: 'complete',
          taskId,
        });
        taskStartedMap.set(context.event.event_ts, true);
        return;
      }

      logger.warn(
        { eventTs: context.event.event_ts },
        'No taskId found in taskMap'
      );
    },
    onFinish() {
      taskMap.delete(context.event.event_ts);
      taskStartedMap.delete(context.event.event_ts);
    },
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'orchestrator',
    },
  });
