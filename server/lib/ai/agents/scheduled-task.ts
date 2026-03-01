import { stepCountIs, ToolLoopAgent } from 'ai';
import { provider } from '~/lib/ai/providers';
import { getUserInfo } from '~/lib/ai/tools/chat/get-user-info';
import { getWeather } from '~/lib/ai/tools/chat/get-weather';
import { sandbox } from '~/lib/ai/tools/chat/sandbox';
import { searchWeb } from '~/lib/ai/tools/chat/search-web';
import { skip } from '~/lib/ai/tools/chat/skip';
import { sendScheduledMessage } from '~/lib/ai/tools/tasks/send-scheduled-message';
import { successToolCall } from '~/lib/ai/utils';
import type { SlackMessageContext, Stream } from '~/types';
import { getTime } from '~/utils/time';

export function scheduledTaskAgent({
  context,
  destination,
  stream,
  timezone,
}: {
  context: SlackMessageContext;
  destination: {
    channelId: string;
    threadTs?: string | null;
    taskId: string;
  };
  stream: Stream;
  timezone: string;
}) {
  return new ToolLoopAgent({
    model: provider.languageModel('chat-model'),
    instructions: `\
You are Gorkie running an automated scheduled task.
You are not replying to a live chat message; you are executing a background job.
Current timezone for this run: ${timezone}.
The current ISO time is: ${getTime()}.

Rules:
- Complete the task autonomously.
- Use tools when needed for facts or execution (searchWeb/getWeather/getUserInfo/sandbox).
- Do not create new schedules or reminders.
- Always end by calling sendScheduledMessage exactly once with the final user-facing result.
- If the task cannot be completed, still call sendScheduledMessage with a concise failure summary and next step.
`,
    toolChoice: 'required',
    tools: {
      searchWeb: searchWeb({ context, stream }),
      getWeather: getWeather({ context, stream }),
      getUserInfo: getUserInfo({ context, stream }),
      sandbox: sandbox({ context, stream }),
      sendScheduledMessage: sendScheduledMessage({
        client: context.client,
        destination,
        stream,
      }),
      skip: skip({ context, stream }),
    },
    stopWhen: [
      stepCountIs(15),
      successToolCall('sendScheduledMessage'),
      successToolCall('skip'),
    ],
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'scheduled-task-agent',
    },
  });
}
