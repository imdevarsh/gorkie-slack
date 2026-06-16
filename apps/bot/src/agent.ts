import {
  chatAttempts,
  createAgent,
  openSession,
  type PiAttempt,
  persistSession,
  type SandboxContext,
  systemPrompt,
} from '@repo/ai';
import { E2BSandboxProvider } from '@repo/sandbox';
import { type Message, StreamingPlan, type Thread } from 'chat';
import { bot } from '@/chat';
import { env } from '@/env';
import { promptWithAttachments, seedAttachments } from '@/lib/ai/attachments';
import {
  type AttemptFailure,
  attemptDelayMs,
  nextAttempt,
  sameAttempt,
} from '@/lib/ai/attempts';
import { requestHints } from '@/lib/ai/hints';
import { renderStream } from '@/lib/ai/stream';
import { buildTools } from '@/lib/ai/toolset';
import { runQueuedTurn } from '@/lib/ai/turn-queue';
import { agentErrorMessage } from '@/lib/errors';
import logger from '@/lib/logger';
import { setThinking } from '@/lib/slack/thread';
import { slack } from '@/slack';

const sandbox = new E2BSandboxProvider({
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
      await slack
        .postEphemeral(
          input.thread.id,
          input.message.author.userId,
          'Got it! Steering conversation.'
        )
        .then(() => undefined)
        .catch(() => undefined);
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

  const parkSession = async ({ pause }: { pause: boolean }): Promise<void> => {
    if (!session) {
      return;
    }
    const ending = session;
    await persistSession({
      session: ending,
      snapshotSource: sandboxContext,
      threadId,
    }).catch(async () => {
      await ending.destroy().catch(() => undefined);
    });
    if (pause) {
      await sandbox.pauseSession(threadId);
    }
  };

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
    await parkSession({ pause: true });
    logger.info(
      { ...completion, attempt: attemptLog(activeAttempt), threadId },
      '[agent] turn complete'
    );
  } catch (error) {
    if (controller.signal.aborted) {
      logger.info({ threadId }, '[agent] turn interrupted');
      await parkSession({ pause: false });
    } else {
      logger.error(
        { attempt: attemptLog(activeAttempt), err: error, threadId },
        '[agent] turn failed'
      );
      await parkSession({ pause: true });
      await thread.post(agentErrorMessage(error));
    }
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
    let hasStreamed = false;
    const attemptHistory: AttemptFailure[] = [];
    let attempt = chatAttempts[0];
    while (attempt) {
      const currentAttempt = attempt;
      try {
        activeAttempt = currentAttempt;
        const agent = createAgent({
          attempt: currentAttempt,
          onSandboxReady: async (context) => {
            sandboxContext = context;
            attachments = await seedAttachments({
              message,
              sandboxContext: context,
            });
          },
          sandbox,
          sessionId: threadId,
          systemPrompt: systemPrompt({ ...hints, model: currentAttempt.model }),
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
        attemptHistory.push({ attempt: currentAttempt, error });
        const retryAttempt = nextAttempt({
          attempts: chatAttempts,
          error,
          failures: attemptHistory,
        });
        if (controller.signal.aborted || hasStreamed || !retryAttempt) {
          throw error;
        }
        logger.warn(
          {
            attempt: attemptLog(currentAttempt),
            err: error,
            nextAttempt: attemptLog(retryAttempt),
            threadId,
          },
          sameAttempt(retryAttempt, currentAttempt)
            ? '[agent] attempt failed, retrying same model'
            : '[agent] attempt failed, falling back'
        );
        await session?.detach().catch(() => undefined);
        session = undefined;
        if (sameAttempt(retryAttempt, currentAttempt)) {
          const delayMs = attemptDelayMs({
            attempt: currentAttempt,
            error,
            failures: attemptHistory,
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        attempt = retryAttempt;
      }
    }
  }
}

function attemptLog(attempt: PiAttempt | undefined) {
  return attempt
    ? { model: attempt.model, provider: attempt.provider }
    : undefined;
}
