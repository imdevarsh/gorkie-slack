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
import { searchWeb } from '~/lib/ai/tools/chat/search-web';
import { skip } from '~/lib/ai/tools/chat/skip';
import { summariseThread } from '~/lib/ai/tools/chat/summarise-thread';
import { successToolCall } from '~/lib/ai/utils';
import type { ChatRequestHints, SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';

export const orchestratorAgent = ({
  context,
  requestHints,
  files,
}: {
  context: SlackMessageContext;
  requestHints: ChatRequestHints;
  files?: SlackFile[];
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
      getWeather,
      searchWeb,
      searchSlack: searchSlack({ context }),
      getUserInfo: getUserInfo({ context }),
      leaveChannel: leaveChannel({ context }),
      scheduleReminder: scheduleReminder({ context }),
      summariseThread: summariseThread({ context }),
      sandbox: sandbox({ context, files }),
      mermaid: mermaid({ context }),
      react: react({ context }),
      reply: reply({ context }),
      skip: skip({ context }),
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
