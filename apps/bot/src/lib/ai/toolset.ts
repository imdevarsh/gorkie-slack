import nodePath from 'node:path/posix';
import type { SandboxContext } from '@repo/ai';
import type { ToolSet } from 'ai';
import type { Chat, Message, Thread } from 'chat';
import { createChatTools } from 'chat/ai';
import { env } from '@/env';
import { uploadFileToThread } from '@/lib/slack/thread';
import { generateImageTool } from './tools/generate-image';
import { mermaidTool } from './tools/mermaid';
import { scheduleReminderTool } from './tools/schedule-reminder';
import { searchSlack } from './tools/search-slack';
import { searchWeb } from './tools/search-web';
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
  const { startTyping: _startTyping, ...chatTools } = createChatTools({
    chat: bot,
    preset: 'messenger',
    requireApproval: false,
  });

  return {
    ...chatTools,
    mermaid: mermaidTool({ thread }),
    scheduleReminder: scheduleReminderTool({ message }),
    searchSlack: searchSlack({ message }),
    searchWeb: searchWeb({ apiKey: env.EXA_API_KEY }),
    summarizeThread: summarizeThreadTool({ bot, threadId: thread.id }),
    generateImage: generateImageTool({
      upload: async ({ bytes, mediaType, index, total }) => {
        const filename = `gorkie-image-${index + 1}.${mediaType.split('/').at(1) ?? 'png'}`;
        await uploadFileToThread({
          file: Buffer.from(bytes),
          filename,
          thread,
          title: total > 1 ? `Generated image ${index + 1}` : 'Generated image',
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
        await uploadFileToThread({
          file: Buffer.from(bytes),
          filename: resolvedFilename,
          thread,
          title: title ?? resolvedFilename,
        });
        return { filename: resolvedFilename, uploaded: true };
      },
    }),
  };
}
