import nodePath from 'node:path/posix';
import type { SandboxContext } from '@repo/ai';
import type { ToolSet } from 'ai';
import type { Chat, Message, Thread } from 'chat';
import { createChatTools } from 'chat/ai';
import { env } from '@/env';
import { generateImageTool } from './tools/generate-image';
import { getFileTool } from './tools/get-file';
import { getUserTool } from './tools/get-user';
import { leaveThreadTool } from './tools/leave-thread';
import { listThreadsTool } from './tools/list-threads';
import { mermaidTool } from './tools/mermaid';
import { readConversationHistoryTool } from './tools/read-conversation-history';
import { scheduleReminderTool } from './tools/schedule-reminder';
import { searchSlack } from './tools/search-slack';
import { searchWeb } from './tools/search-web';
import { skipTool } from './tools/skip';
import { summarizeThreadTool } from './tools/summarize-thread';
import { uploadFileTool } from './tools/upload-file';

export function buildTools({
  bot,
  getSandboxContext,
  message,
  thread,
}: {
  bot: Chat;
  getSandboxContext: () => SandboxContext | undefined;
  message: Message;
  thread: Thread;
}): ToolSet {
  const chatTools = createChatTools({
    chat: bot,
    preset: 'messenger',
    requireApproval: false,
  });

  const {
    addReaction,
    getChannelInfo,
    postChannelMessage,
    postMessage,
    sendDirectMessage,
  } = chatTools;

  return {
    ...(addReaction && { addReaction }),
    getUser: getUserTool(),
    ...(postChannelMessage && { postChannelMessage }),
    ...(postMessage && { postMessage }),
    getFile: getFileTool({ getSandboxContext }),
    leaveThread: leaveThreadTool({ thread }),
    listThreads: listThreadsTool({ currentThreadId: thread.id }),
    readConversationHistory: readConversationHistoryTool({
      currentThreadId: thread.id,
    }),
    ...(getChannelInfo && { getChannelInfo }),
    ...(sendDirectMessage && { sendDirectMessage }),
    mermaid: mermaidTool({ thread }),
    scheduleReminder: scheduleReminderTool({ message }),
    skip: skipTool({ threadId: thread.id }),
    searchSlack: searchSlack({ message }),
    searchWeb: searchWeb({ apiKey: env.EXA_API_KEY }),
    summarizeThread: summarizeThreadTool({ bot, threadId: thread.id }),
    generateImage: generateImageTool({
      upload: async ({ bytes, mediaType, index, total }) => {
        const filename = `gorkie-image-${index + 1}.${mediaType.split('/').at(1) ?? 'png'}`;
        await thread.post({
          files: [{ data: Buffer.from(bytes), filename }],
          markdown:
            total > 1 ? `Generated image ${index + 1}` : 'Generated image',
        });
      },
    }),
    uploadFile: uploadFileTool({
      upload: async ({ filename, path, title }) => {
        const sandboxContext = getSandboxContext();
        if (!sandboxContext) {
          throw new Error('No active sandbox session is available.');
        }

        const { session, sessionWorkDir } = sandboxContext;
        const sandboxPath = nodePath.normalize(
          path.startsWith('/') ? path : nodePath.join(sessionWorkDir, path)
        );
        if (
          sandboxPath !== sessionWorkDir &&
          !sandboxPath.startsWith(`${sessionWorkDir}/`)
        ) {
          throw new Error(
            'uploadFile can only upload files from the workspace.'
          );
        }

        const bytes = await session.readBinaryFile({ path: sandboxPath });
        if (!bytes) {
          throw new Error(`Could not find file: ${path}`);
        }

        const resolvedFilename =
          filename ?? nodePath.basename(sandboxPath) ?? 'artifact';
        await thread.post({
          files: [{ data: Buffer.from(bytes), filename: resolvedFilename }],
          markdown: title ?? resolvedFilename,
        });
        return { filename: resolvedFilename, uploaded: true };
      },
    }),
  };
}
