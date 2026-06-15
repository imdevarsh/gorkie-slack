import {
  buildSystemPrompt,
  createGorkieAgent,
  modelConfig,
  openSession,
  persistSession,
  type RequestHints,
} from '@repo/ai';
import { getUserCustomization } from '@repo/db/queries';
import { createE2BSandboxProvider } from '@repo/sandbox';
import { getTime } from '@repo/utils/time';
import type { Message, Thread } from 'chat';
import { StreamingPlan } from 'chat';
import { env } from '@/env';
import logger from '@/lib/logger';
import { renderHarnessStream } from '@/lib/render-stream';
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

async function resolveHints(
  thread: Thread,
  userId: string
): Promise<RequestHints> {
  const [channel, server, customization] = await Promise.all([
    resolveChannelName(thread.channelId),
    resolveServerName(),
    getUserCustomization(userId).catch(() => null),
  ]);
  return {
    channel,
    customization,
    model: modelConfig.modelId,
    server,
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
  await thread.startTyping().catch(() => undefined);

  const hints = await resolveHints(thread, message.author.userId);
  const agent = createGorkieAgent({
    apiKey: env.HACKCLUB_API_KEY,
    sandbox,
    systemPrompt: buildSystemPrompt(hints),
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
  }
}
