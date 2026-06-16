import {
  buildSystemPrompt,
  chatAttempts,
  createAgent,
  isRetryableProviderError,
  isRetryableSameAttempt,
  openSession,
  type PiAttempt,
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
  let activeAttempt: PiAttempt | undefined;
  let sandboxContext: SandboxContext | undefined;
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
    await persistSession({ session, snapshotSource: sandboxContext, threadId });
    await sandbox.pauseSession(threadId);
    logger.info(
      { ...completion, attempt: attemptLog(activeAttempt), threadId },
      '[agent] turn complete'
    );
  } catch (error) {
    // Interrupted by a follow-up: persist the partial transcript but leave the
    // sandbox warm so the steering turn restarts instantly.
    if (controller.signal.aborted) {
      logger.info({ threadId }, '[agent] turn interrupted');
      if (session) {
        await persistSession({
          session,
          snapshotSource: sandboxContext,
          threadId,
        }).catch(() => undefined);
      }
    } else {
      logger.error(
        { attempt: attemptLog(activeAttempt), err: error, threadId },
        '[agent] turn failed'
      );
      if (session) {
        const failedSession = session;
        await persistSession({
          session: failedSession,
          snapshotSource: sandboxContext,
          threadId,
        }).catch(async () => {
          await failedSession.destroy().catch(() => undefined);
        });
        await sandbox.pauseSession(threadId);
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
    let attachments: Awaited<ReturnType<typeof seedAttachments>> = [];
    // Once any chunk has reached Slack, switching models would re-stream from
    // scratch and duplicate the message — so fallback is only allowed while
    // nothing visible has been emitted yet.
    let hasStreamed = false;
    for (const [index, attempt] of chatAttempts.entries()) {
      for (let tryNumber = 1; tryNumber <= attempt.retries; tryNumber++) {
        try {
          activeAttempt = attempt;
          const agent = createAgent({
            attempt,
            onSandboxReady: async (context) => {
              sandboxContext = context;
              attachments = await seedAttachments({
                message,
                sandboxContext: context,
              });
            },
            sandbox,
            systemPrompt: buildSystemPrompt({ ...hints, model: attempt.model }),
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
          for await (const chunk of renderStream(result.fullStream)) {
            hasStreamed = true;
            yield chunk;
          }

          const [text, finishReason] = await Promise.all([
            result.text,
            result.finishReason,
          ]);
          completion = { finishReason, textLength: text.length };
          return;
        } catch (error) {
          const retrySameModel =
            tryNumber < attempt.retries && isRetryableSameAttempt(error);
          const nextAttempt = retrySameModel
            ? attempt
            : chatAttempts[index + 1];
          if (
            controller.signal.aborted ||
            hasStreamed ||
            !isRetryableProviderError(error) ||
            !nextAttempt
          ) {
            throw error;
          }
          logger.warn(
            {
              attempt: attemptLog(attempt),
              err: error,
              nextAttempt: attemptLog(nextAttempt),
              retry: retrySameModel
                ? {
                    next: tryNumber + 1,
                    remaining: attempt.retries - tryNumber,
                  }
                : undefined,
              threadId,
            },
            retrySameModel
              ? '[agent] model attempt failed, retrying same model'
              : '[agent] model attempt failed, retrying next model'
          );
          if (session) {
            await session.detach().catch(() => undefined);
            session = undefined;
          }
          if (!retrySameModel) {
            break;
          }
        }
      }
    }
  }
}

function attemptLog(attempt: PiAttempt | undefined) {
  return attempt
    ? { model: attempt.model, provider: attempt.provider }
    : undefined;
}
