import { stepCountIs, ToolLoopAgent } from 'ai';
import { systemPrompt } from '~/lib/ai/prompts';
import { provider } from '~/lib/ai/providers';
import { getUserInfo } from '~/lib/ai/tools/chat/get-user-info';
import { getWeather } from '~/lib/ai/tools/chat/get-weather';
import { leaveChannel } from '~/lib/ai/tools/chat/leave-channel';
import { mermaid } from '~/lib/ai/tools/chat/mermaid';
import { react } from '~/lib/ai/tools/chat/react';
import { reply } from '~/lib/ai/tools/chat/reply';
import { sandbox } from '~/lib/ai/tools/chat/sandbox';
import { scheduleReminder } from '~/lib/ai/tools/chat/schedule-reminder';
import { searchSlack } from '~/lib/ai/tools/chat/search-slack';
import { skip } from '~/lib/ai/tools/chat/skip';
import { summariseThread } from '~/lib/ai/tools/chat/summarise-thread';
import { searchWeb } from '~/lib/ai/tools/shared/search-web';
import { successToolCall } from '~/lib/ai/utils';
import logger from '~/lib/logger';
import type { ChatRequestHints, SlackMessageContext, Stream } from '~/types';
import type { SlackFile } from '~/utils/images';
import { createTask, finishTask } from '../utils/task';

const taskMap = new Map<string, string>();

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
      return {};
    },
    async onStepFinish({ reasoningText }) {
      const normalizedReasoning = String(reasoningText)
        .trim()
        .split('\n')
        .filter(Boolean)
        .filter((x) => x !== '[REDACTED]')
        .join('\n');

      const taskId = taskMap.get(context.event.event_ts);
      if (taskId) {
        const reasoningSummary = normalizedReasoning || 'No reasoning provided';
        await finishTask(stream, taskId, 'complete', reasoningSummary);
      } else {
        logger.warn(
          { eventTs: context.event.event_ts },
          'No taskId found in taskMap'
        );
      }
    },
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'orchestrator',
    },
  });
