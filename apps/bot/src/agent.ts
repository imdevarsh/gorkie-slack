import {
  buildSystemPrompt,
  CHAT_MODEL_ID,
  createGorkieAgent,
  type GorkieSandboxContext,
  openSession,
  persistSession,
  type RequestHints,
} from '@repo/ai';
import { getUserCustomization } from '@repo/db/queries';
import { createE2BSandboxProvider } from '@repo/sandbox';
import { getTime } from '@repo/utils/time';
import { type Message, StreamingPlan, type Thread } from 'chat';
import PQueue from 'p-queue';
import { bot } from '@/chat';
import { env } from '@/env';
import { promptWithAttachments, seedAttachments } from '@/lib/ai/attachments';
import { renderHarnessStream } from '@/lib/ai/stream';
import { buildTools } from '@/lib/ai/toolset';
import { agentErrorMessage } from '@/lib/errors';
import logger from '@/lib/logger';
import {
  acknowledgeSteer,
  setThinking,
  slackThreadOf,
} from '@/lib/slack/thread';
import { slack } from '@/slack';

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
  const slackThread = slackThreadOf(thread);
  const channelId = slackThread?.channel ?? thread.channelId;
  const [channel, server, customization] = await Promise.all([
    resolveChannelName(channelId),
    resolveServerName(),
    getUserCustomization(message.author.userId).catch(() => null),
  ]);
  return {
    channel,
    channelId,
    customization,
    messageId: message.id,
    model: CHAT_MODEL_ID,
    server,
    threadId: thread.id,
    time: getTime(),
  };
}

interface ThreadQueue {
  controller?: AbortController;
  queue: PQueue;
  turns: number;
}
const threadQueues = new Map<string, ThreadQueue>();

// pi runs one turn at a time per thread (p-queue, concurrency 1). Steering: a
// follow-up that arrives mid-turn gracefully aborts the live turn (pi stops at a
// tool boundary and persists its partial transcript), then runs as a fresh turn
// that resumes that transcript — so the new message redirects the current work.
export async function runTurn(input: {
  message: Message;
  thread: Thread;
}): Promise<void> {
  const existing = threadQueues.get(input.thread.id);
  if (existing?.controller) {
    existing.controller.abort();
    await acknowledgeSteer(input).catch(() => undefined);
  }
  return enqueueTurn(input);
}

function getThreadQueue(threadId: string): ThreadQueue {
  const existing = threadQueues.get(threadId);
  if (existing) {
    return existing;
  }
  const entry: ThreadQueue = {
    queue: new PQueue({ concurrency: 1 }),
    turns: 0,
  };
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
    const controller = new AbortController();
    entry.controller = controller;
    try {
      await executeTurn(input, controller);
    } finally {
      if (entry.controller === controller) {
        entry.controller = undefined;
      }
      entry.turns -= 1;
      if (entry.turns === 0) {
        threadQueues.delete(threadId);
      }
    }
  });
}

async function executeTurn(
  { message, thread }: { message: Message; thread: Thread },
  controller: AbortController
): Promise<void> {
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
    // Interrupted by a follow-up: pi already stopped gracefully and persisted
    // its partial transcript, so finalize quietly — the new turn handles the reply.
    if (controller.signal.aborted) {
      logger.info({ threadId }, '[agent] turn interrupted');
      if (session) {
        await persistSession({ session, status: 'paused', threadId }).catch(
          () => undefined
        );
      }
    } else {
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
      await thread.post(agentErrorMessage(error));
    }
  } finally {
    await setThinking(thread, '');
  }

  async function* renderTurn({
    message,
    thread,
  }: {
    message: Message;
    thread: Thread;
  }) {
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
      tools: buildTools({
        bot,
        getSandboxContext: () => sandboxContext,
        thread,
      }),
    });
    session = await openSession({ agent, threadId });
    const result = await agent.stream({
      abortSignal: controller.signal,
      prompt: promptWithAttachments({ attachments, text: message.text }),
      session,
    });
    yield* renderHarnessStream(result.fullStream);

    const [text, finishReason] = await Promise.all([
      result.text,
      result.finishReason,
    ]);
    completion = { finishReason, textLength: text.length };
  }
}
