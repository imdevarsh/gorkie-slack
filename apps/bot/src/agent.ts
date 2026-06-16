import {
  buildSystemPrompt,
  createAgent,
  openSession,
  persistSession,
  type SandboxContext,
} from '@repo/ai';
import { createE2BSandboxProvider } from '@repo/sandbox';
import { type Message, StreamingPlan, type Thread } from 'chat';
import { bot } from '@/chat';
import { env } from '@/env';
import { promptWithAttachments, seedAttachments } from '@/lib/ai/attachments';
import { requestHints } from '@/lib/ai/hints';
import { renderStream } from '@/lib/ai/stream';
import { buildTools } from '@/lib/ai/toolset';
import { runQueuedTurn } from '@/lib/ai/turn-queue';
import { agentErrorMessage } from '@/lib/errors';
import logger from '@/lib/logger';
import { rawSlackThreadFrom, setThinking } from '@/lib/slack/thread';
import { slack } from '@/slack';

const sandbox = createE2BSandboxProvider({
  apiKey: env.E2B_API_KEY,
  logger,
});

export function runTurn(input: {
  message: Message;
  thread: Thread;
}): Promise<void> {
  return runQueuedTurn({
    threadId: input.thread.id,
    onInterrupt: async () => {
      const slackThread = rawSlackThreadFrom(input.thread);
      if (!slackThread) {
        return;
      }
      await slack.webClient.chat.postEphemeral({
        channel: slackThread.channel,
        text: 'Got it! Steering conversation.',
        thread_ts: slackThread.threadTs,
        user: input.message.author.userId,
      });
    },
    run: (controller) => executeTurn(input, controller),
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
    const hints = await requestHints({ thread, message });
    let sandboxContext: SandboxContext | undefined;
    let attachments: Awaited<ReturnType<typeof seedAttachments>> = [];
    const agent = createAgent({
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
    yield* renderStream(result.fullStream);

    const [text, finishReason] = await Promise.all([
      result.text,
      result.finishReason,
    ]);
    completion = { finishReason, textLength: text.length };
  }
}
