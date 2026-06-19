import nodePath from 'node:path/posix';
import type { SandboxContext } from '@repo/ai';
import type { InferToolInput, InferToolOutput, Tool, ToolSet } from 'ai';
import type { Channel, Chat, Message, Thread } from 'chat';
import { createChatTools } from 'chat/ai';
import { z } from 'zod';
import { env } from '@/env';
import { uploadFileToThread } from '@/lib/slack/thread';
import { generateImageTool } from './tools/generate-image';
import { listThreadsTool } from './tools/list-threads';
import { mermaidTool } from './tools/mermaid';
import { readConversationHistoryTool } from './tools/read-conversation-history';
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
  const chatTools = createChatTools({
    chat: bot,
    preset: 'messenger',
    requireApproval: false,
  });

  const {
    addReaction,
    getChannelInfo,
    getUser,
    postChannelMessage,
    postMessage,
    sendDirectMessage,
  } = chatTools;

  return {
    ...(addReaction && { addReaction }),
    ...(getUser && { getUser }),
    ...(postChannelMessage && { postChannelMessage }),
    ...(postMessage && { postMessage }),
    listThreads: listThreadsTool({ bot }),
    readConversationHistory: readConversationHistoryTool({ bot }),
    ...(getChannelInfo && {
      getChannelInfo: guardConversationRead({
        bot,
        thread,
        tool: getChannelInfo,
      }),
    }),
    ...(sendDirectMessage && { sendDirectMessage }),
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

function guardConversationRead<TOOL extends Tool>({
  bot,
  thread,
  tool,
}: {
  bot: Chat;
  thread: Thread;
  tool: TOOL;
}): TOOL {
  const execute = tool.execute;
  if (!execute) {
    return tool;
  }

  return {
    ...tool,
    execute: async (
      input: InferToolInput<TOOL>,
      options: Parameters<NonNullable<TOOL['execute']>>[1]
    ): Promise<InferToolOutput<TOOL>> => {
      const parsed = z
        .union([
          z.object({ threadId: z.string() }),
          z.object({ channelId: z.string() }),
        ])
        .parse(input);
      if ('threadId' in parsed && parsed.threadId.split(':').length < 3) {
        throw new Error(
          `${parsed.threadId} is a channel id, not a thread id. Use readConversationHistory with channelId instead.`
        );
      }
      const channel: Channel =
        'threadId' in parsed
          ? bot.thread(parsed.threadId).channel
          : bot.channel(parsed.channelId);

      if (
        !(
          ('threadId' in parsed && parsed.threadId === thread.id) ||
          channel.id === thread.channelId
        )
      ) {
        const metadata = await channel.fetchMetadata();
        if (metadata.isDM || metadata.channelVisibility !== 'workspace') {
          throw new Error(
            'Reading other DMs, private channels, or external conversations is not allowed.'
          );
        }
      }

      return await execute(input, options);
    },
  };
}
