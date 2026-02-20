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
import { setStatus } from '~/lib/ai/utils/status';
import type { ChatRequestHints, SlackMessageContext, Stream } from '~/types';
import type { SlackFile } from '~/utils/images';

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
    prepareStep: async () => {
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
      return {};
    },
    stopWhen: [
      stepCountIs(25),
      successToolCall('leaveChannel'),
      successToolCall('reply'),
      successToolCall('skip'),
    ],
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'orchestrator',
    },
  });
