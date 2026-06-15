import nodePath from 'node:path/posix';
import {
  buildSystemPrompt,
  CHAT_MODEL_ID,
  createGorkieAgent,
  createTools,
  type GorkieSandboxContext,
  generateImageTool,
  openSession,
  persistSession,
  type RequestHints,
  steerThread,
  uploadFileTool,
} from '@repo/ai';
import { getUserCustomization } from '@repo/db/queries';
import { createE2BSandboxProvider } from '@repo/sandbox';
import { getTime } from '@repo/utils/time';
import type { ToolSet } from 'ai';
import {
  type Message,
  type StreamChunk,
  StreamingPlan,
  type Thread,
} from 'chat';
import { createChatTools } from 'chat/ai';
import PQueue from 'p-queue';
import { bot } from '@/chat';
import { env } from '@/env';
import logger from '@/lib/logger';
import { renderHarnessStream } from '@/lib/render-stream';
import { slack } from '@/slack';

const LOADING_MESSAGES = [
  'is pondering your question',
  'is working on it',
  'is putting thoughts together',
  'is mulling this over',
  'is figuring this out',
  'is cooking up a response',
  'is connecting the dots',
  'is piecing things together',
  'is giving it a good think',
];

interface SeededAttachment {
  mimeType?: string;
  name: string;
  path: string;
  type: string;
}

// Slack encodes thread ids as `slack:<channel>:<threadTs>`.
function threadTsOf(thread: Thread): string | undefined {
  return thread.id.split(':').at(2) || undefined;
}

async function setThinking(thread: Thread, status: string): Promise<void> {
  const threadTs = threadTsOf(thread);
  if (!threadTs) {
    return;
  }
  await slack.webClient.assistant.threads
    .setStatus({
      channel_id: thread.channelId,
      thread_ts: threadTs,
      status,
      ...(status ? { loading_messages: LOADING_MESSAGES } : {}),
    })
    .catch(() => undefined);
}

// chat/ai Slack tools (the `messenger` preset: reads + post/DM/react/typing) plus
// gorkie's own host tools. Approval is off in Part 1 (no approval UI yet); the
// pause→Slack-buttons→resume flow returns with MCP in Part 2.
function buildTools({
  getSandboxContext,
  thread,
}: {
  getSandboxContext: () => GorkieSandboxContext | undefined;
  thread: Thread;
}): ToolSet {
  const { startTyping: _startTyping, ...chatTools } = createChatTools({
    chat: bot,
    preset: 'messenger',
    requireApproval: false,
  });

  return {
    ...chatTools,
    ...createTools({ exaApiKey: env.EXA_API_KEY }),
    generateImage: generateImageTool({
      upload: async ({ bytes, mediaType, index, total }) => {
        const threadTs = threadTsOf(thread);
        const file = {
          channel_id: thread.channelId,
          file: Buffer.from(bytes),
          filename: `gorkie-image-${index + 1}.${mediaType.split('/').at(1) ?? 'png'}`,
          title: total > 1 ? `Generated image ${index + 1}` : 'Generated image',
        };
        await slack.webClient.files.uploadV2(
          threadTs ? { ...file, thread_ts: threadTs } : file
        );
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
        const threadTs = threadTsOf(thread);
        const file = {
          channel_id: thread.channelId,
          file: Buffer.from(bytes),
          filename: resolvedFilename,
          title: title ?? resolvedFilename,
        };
        await slack.webClient.files.uploadV2(
          threadTs ? { ...file, thread_ts: threadTs } : file
        );
        return { filename: resolvedFilename, uploaded: true };
      },
    }),
  };
}

const sandbox = createE2BSandboxProvider({
  apiKey: env.E2B_API_KEY,
  logger,
});

const channelNames = new Map<string, string>();
let serverName: string | undefined;

async function resolveChannelName(
  channelId: string
): Promise<string | undefined> {
  const cached = channelNames.get(channelId);
  if (cached) {
    return cached;
  }
  try {
    const info = await slack.webClient.conversations.info({
      channel: channelId,
    });
    const name = info.channel?.name;
    if (name) {
      channelNames.set(channelId, name);
    }
    return name;
  } catch {
    return;
  }
}

async function resolveServerName(): Promise<string | undefined> {
  if (serverName) {
    return serverName;
  }
  try {
    const info = await slack.webClient.team.info();
    serverName = info.team?.name;
    return serverName;
  } catch {
    return;
  }
}

async function resolveHints({
  thread,
  message,
}: {
  thread: Thread;
  message: Message;
}): Promise<RequestHints> {
  const [channel, server, customization] = await Promise.all([
    resolveChannelName(thread.channelId),
    resolveServerName(),
    getUserCustomization(message.author.userId).catch(() => null),
  ]);
  return {
    channel,
    channelId: thread.channelId,
    customization,
    messageId: message.id,
    model: CHAT_MODEL_ID,
    server,
    threadId: thread.id,
    time: getTime(),
  };
}

const threadQueues = new Map<string, { queue: PQueue; turns: number }>();

// pi sessions are one turn at a time per thread, and a turn can outlive the Chat
// SDK's thread lock. We keep Chat SDK concurrent so follow-ups can steer the
// live pi turn; p-queue is only the FIFO fallback when steering is unavailable.
export function runTurn(input: {
  message: Message;
  thread: Thread;
}): Promise<void> {
  const threadId = input.thread.id;
  const existing = threadQueues.get(threadId);
  if (existing?.turns && input.message.attachments.length === 0) {
    return steerThread({ text: input.message.text, threadId })
      .catch((error) => {
        logger.warn({ err: error, threadId }, '[agent] steering failed');
        return false;
      })
      .then((steered) => {
        if (steered) {
          logger.info(
            { text: input.message.text, threadId },
            '[agent] turn steered'
          );
          return;
        }
        return enqueueTurn(input);
      });
  }

  return enqueueTurn(input);
}

function safeAttachmentName({
  fallback,
  name,
}: {
  fallback: string;
  name?: string;
}): string {
  const base = nodePath.basename(name || fallback) || fallback;
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function seedAttachments({
  message,
  sandboxContext,
}: {
  message: Message;
  sandboxContext: GorkieSandboxContext;
}): Promise<SeededAttachment[]> {
  const seeded: SeededAttachment[] = [];
  for (const [index, attachment] of message.attachments.entries()) {
    const data = attachment.fetchData
      ? await attachment.fetchData()
      : attachment.data;
    if (!data) {
      continue;
    }

    const filename = safeAttachmentName({
      fallback: `attachment-${index + 1}`,
      name: attachment.name,
    });
    const path = nodePath.join(
      sandboxContext.sessionWorkDir,
      'attachments',
      message.id.replace(/[^a-zA-Z0-9._-]/g, '_'),
      filename
    );
    const bytes =
      data instanceof Blob
        ? new Uint8Array(await data.arrayBuffer())
        : new Uint8Array(data);
    await sandboxContext.session.writeBinaryFile({ content: bytes, path });
    seeded.push({
      mimeType: attachment.mimeType,
      name: filename,
      path,
      type: attachment.type,
    });
  }
  return seeded;
}

function promptWithAttachments({
  attachments,
  text,
}: {
  attachments: SeededAttachment[];
  text: string;
}): string {
  if (attachments.length === 0) {
    return text;
  }
  const lines = attachments.map(
    (attachment) =>
      `- ${attachment.name} (${attachment.type}${attachment.mimeType ? `, ${attachment.mimeType}` : ''}): ${attachment.path}`
  );
  return [
    text,
    '',
    'Attached files have already been downloaded into the sandbox workspace:',
    ...lines,
    'Use these local paths when reading, editing, or uploading the files.',
  ].join('\n');
}

function getThreadQueue(threadId: string): { queue: PQueue; turns: number } {
  const existing = threadQueues.get(threadId);
  if (existing) {
    return existing;
  }
  const entry = { queue: new PQueue({ concurrency: 1 }), turns: 0 };
  threadQueues.set(threadId, entry);
  return entry;
}

function enqueueTurn(input: {
  message: Message;
  thread: Thread;
}): Promise<void> {
  const threadId = input.thread.id;
  const entry = getThreadQueue(threadId);
  entry.turns += 1;
  return entry.queue.add(async () => {
    try {
      await executeTurn(input);
    } finally {
      entry.turns -= 1;
      if (entry.turns === 0) {
        threadQueues.delete(threadId);
      }
    }
  });
}

async function executeTurn({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<void> {
  const threadId = thread.id;
  logger.info({ text: message.text, threadId }, '[agent] turn started');
  await setThinking(thread, 'is thinking');

  let session: Awaited<ReturnType<typeof openSession>> | undefined;
  let completion: { finishReason: string; textLength: number } | undefined;

  try {
    await thread.post(
      new StreamingPlan(renderTurn({ message, thread }), {
        groupTasks: 'plan',
      })
    );
    if (!(session && completion)) {
      throw new Error(
        'Agent turn ended before session completion was recorded.'
      );
    }
    await persistSession({ session, status: 'paused', threadId });
    logger.info({ ...completion, threadId }, '[agent] turn complete');
  } catch (error) {
    logger.error({ err: error, threadId }, '[agent] turn failed');
    if (session) {
      const failedSession = session;
      await persistSession({
        session: failedSession,
        status: 'paused',
        threadId,
      }).catch(async () => {
        await failedSession.destroy().catch(() => undefined);
      });
    }
    await thread.post('Sorry — something went wrong handling that.');
  } finally {
    await setThinking(thread, '');
  }

  async function* renderTurn({
    message,
    thread,
  }: {
    message: Message;
    thread: Thread;
  }): AsyncGenerator<string | StreamChunk> {
    const taskId = `turn-${message.id}`;
    yield {
      id: taskId,
      status: 'in_progress',
      title: 'Thinking',
      type: 'task_update',
    };
    await setThinking(thread, '');

    const hints = await resolveHints({ thread, message });
    let sandboxContext: GorkieSandboxContext | undefined;
    let attachments: Awaited<ReturnType<typeof seedAttachments>> = [];
    const agent = createGorkieAgent({
      apiKey: env.HACKCLUB_API_KEY,
      onSandboxReady: async (context) => {
        sandboxContext = context;
        attachments = await seedAttachments({
          message,
          sandboxContext: context,
        });
      },
      sandbox,
      systemPrompt: buildSystemPrompt(hints),
      tools: buildTools({ getSandboxContext: () => sandboxContext, thread }),
    });
    session = await openSession({ agent, threadId });
    const result = await agent.stream({
      prompt: promptWithAttachments({ attachments, text: message.text }),
      session,
    });
    yield* renderHarnessStream(result.fullStream);

    const [text, finishReason] = await Promise.all([
      result.text,
      result.finishReason,
    ]);
    completion = { finishReason, textLength: text.length };
    yield {
      id: taskId,
      status: 'complete',
      title: 'Thinking',
      type: 'task_update',
    };
  }
}
