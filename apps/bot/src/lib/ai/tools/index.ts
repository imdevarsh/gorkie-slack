import type { ToolSet } from 'ai';
import { cancelScheduledTask } from '@/lib/ai/tools/chat/cancel-scheduled-task';
import { generateImageTool } from '@/lib/ai/tools/chat/generate-image';
import { getUserInfo } from '@/lib/ai/tools/chat/get-user-info';
import { getWeather } from '@/lib/ai/tools/chat/get-weather';
import { leaveChannel } from '@/lib/ai/tools/chat/leave-channel';
import { listScheduledTasks } from '@/lib/ai/tools/chat/list-scheduled-tasks';
import { mermaid } from '@/lib/ai/tools/chat/mermaid';
import { react } from '@/lib/ai/tools/chat/react';
import { readConversationHistory } from '@/lib/ai/tools/chat/read-conversation-history';
import { reply } from '@/lib/ai/tools/chat/reply';
import { sandbox } from '@/lib/ai/tools/chat/sandbox';
import { scheduleReminder } from '@/lib/ai/tools/chat/schedule-reminder';
import { scheduleTask } from '@/lib/ai/tools/chat/schedule-task';
import { searchSlack } from '@/lib/ai/tools/chat/search-slack';
import { searchWeb } from '@/lib/ai/tools/chat/search-web';
import { skip } from '@/lib/ai/tools/chat/skip';
import { summariseThread } from '@/lib/ai/tools/chat/summarise-thread';
import { createRemoteMcpToolset } from '@/lib/mcp/toolset';
import type { SlackFile, SlackMessageContext, Stream } from '@/types';

export async function createToolset({
  context,
  files,
  stream,
}: {
  context: SlackMessageContext;
  files?: SlackFile[];
  stream: Stream;
}): Promise<{ cleanup: () => Promise<void>; tools: ToolSet }> {
  const nativeTools = {
    cancelScheduledTask: cancelScheduledTask({ context, stream }),
    generateImage: generateImageTool({ context, files, stream }),
    getUserInfo: getUserInfo({ context, stream }),
    getWeather: getWeather({ context, stream }),
    leaveChannel: leaveChannel({ context, stream }),
    listScheduledTasks: listScheduledTasks({ context, stream }),
    mermaid: mermaid({ context, stream }),
    react: react({ context, stream }),
    readConversationHistory: readConversationHistory({ context, stream }),
    reply: reply({ context, stream }),
    sandbox: sandbox({ context, files, stream }),
    scheduleReminder: scheduleReminder({ context, stream }),
    scheduleTask: scheduleTask({ context, stream }),
    searchSlack: searchSlack({ context, stream }),
    searchWeb: searchWeb({ context, stream }),
    skip: skip({ context, stream }),
    summariseThread: summariseThread({ context, stream }),
  };
  const remoteMcp = await createRemoteMcpToolset({ context, stream });

  return {
    cleanup: remoteMcp.cleanup,
    tools: { ...nativeTools, ...remoteMcp.tools },
  };
}
