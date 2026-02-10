import { webSearch } from '@exalabs/ai-sdk';
import { stepCountIs, ToolLoopAgent } from 'ai';
import { systemPrompt } from '~/lib/ai/prompts';
import { provider } from '~/lib/ai/providers';
import { getUserInfo } from '~/lib/ai/tools/get-user-info';
import { getWeather } from '~/lib/ai/tools/get-weather';
import { leaveChannel } from '~/lib/ai/tools/leave-channel';
import { mermaid } from '~/lib/ai/tools/mermaid';
import { react } from '~/lib/ai/tools/react';
import { reply } from '~/lib/ai/tools/reply';
import { sandbox } from '~/lib/ai/tools/sandbox';
import { scheduleReminder } from '~/lib/ai/tools/schedule-reminder';
import { searchSlack } from '~/lib/ai/tools/search-slack';
import { skip } from '~/lib/ai/tools/skip';
import { summariseThread } from '~/lib/ai/tools/summarise-thread';
import { successToolCall } from '~/lib/ai/utils';
import type { RequestHints, SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';

export const orchestratorAgent = ({
  context,
  hints,
  files,
}: {
  context: SlackMessageContext;
  hints: RequestHints;
  files?: SlackFile[];
}) =>
  new ToolLoopAgent({
    model: provider.languageModel('chat-model'),
    instructions: systemPrompt({
      agent: 'chat',
      requestHints: hints,
      context,
    }),
    providerOptions: {
      openrouter: {
        reasoning: { enabled: true, exclude: false, effort: 'medium' },
      },
    },
    temperature: 1.1,
    toolChoice: 'required',
    tools: {
      getWeather,
      searchWeb: webSearch({ numResults: 10, type: 'auto' }),
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
