import {
  buildSystemPrompt,
  CHAT_MODEL_ID,
  createGorkieAgent,
  createTools,
  generateImageTool,
  openSession,
  persistSession,
  type RequestHints,
} from '@repo/ai';
import { getUserCustomization } from '@repo/db/queries';
import { createE2BSandboxProvider } from '@repo/sandbox';
import { getTime } from '@repo/utils/time';
import type { ToolSet } from 'ai';
import type { Message, Thread } from 'chat';
import { StreamingPlan } from 'chat';
import { createChatTools } from 'chat/ai';
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
function buildTools(thread: Thread): ToolSet {
  return {
    ...createChatTools({
      chat: bot,
      preset: 'messenger',
      requireApproval: false,
    }),
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

const threadTurns = new Map<string, Promise<void>>();

// pi sessions are one turn at a time per thread, and a turn can outlive the Chat
// SDK's 30s thread lock — so we serialize turns per thread ourselves to keep
// concurrent turns off the same pi session.
export function runTurn(input: {
  message: Message;
  thread: Thread;
}): Promise<void> {
  const threadId = input.thread.id;
  const next = (threadTurns.get(threadId) ?? Promise.resolve()).then(() =>
    executeTurn(input)
  );
  threadTurns.set(threadId, next);
  next.finally(() => {
    if (threadTurns.get(threadId) === next) {
      threadTurns.delete(threadId);
    }
  });
  return next;
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

  const hints = await resolveHints({ thread, message });
  const agent = createGorkieAgent({
    apiKey: env.HACKCLUB_API_KEY,
    sandbox,
    systemPrompt: buildSystemPrompt(hints),
    tools: buildTools(thread),
  });
  const session = await openSession({ agent, threadId });

  try {
    const result = await agent.stream({ prompt: message.text, session });
    await thread.post(
      new StreamingPlan(renderHarnessStream(result.fullStream), {
        groupTasks: 'plan',
      })
    );
    const [text, finishReason] = await Promise.all([
      result.text,
      result.finishReason,
    ]);
    // Pause the sandbox after each turn (e2b betaPause); the next turn resumes it.
    await persistSession({ session, status: 'paused', threadId });
    logger.info(
      { finishReason, textLength: text.length, threadId },
      '[agent] turn complete'
    );
  } catch (error) {
    logger.error({ err: error, threadId }, '[agent] turn failed');
    await persistSession({ session, status: 'paused', threadId }).catch(
      async () => {
        await session.destroy().catch(() => undefined);
      }
    );
    await thread.post('Sorry — something went wrong handling that.');
  } finally {
    await setThinking(thread, '');
  }
}
