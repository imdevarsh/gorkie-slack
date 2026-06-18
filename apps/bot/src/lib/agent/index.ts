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
import { env } from '@/env';
import { deleteTurnControls, postTurnControls } from '@/lib/agent/controls';
import { createLineReply } from '@/lib/agent/line-reply';
import {
  type ActiveTurn,
  setPromptControl,
  steerActiveTurn,
} from '@/lib/agent/steering';
import { promptWithAttachments, seedAttachments } from '@/lib/ai/attachments';
import {
  type AttemptFailure,
  attemptDelayMs,
  nextAttempt,
} from '@/lib/ai/attempts';
import { requestHints } from '@/lib/ai/hints';
import { renderStream } from '@/lib/ai/stream';
import { buildTools } from '@/lib/ai/toolset';
import { runQueuedTurn } from '@/lib/ai/turn-queue';
import { bot, slack } from '@/lib/chat';
import { agentErrorMessage } from '@/lib/errors';
import logger from '@/lib/logger';
import { setThinking } from '@/lib/slack/thread';

const activeTurns = new Map<string, ActiveTurn>();

const sandbox = new E2BSandboxProvider({
  apiKey: env.E2B_API_KEY,
  logger,
});

export function runTurn(input: {
  message: Message;
  thread: Thread;
}): Promise<void> {
  const activeTurn = activeTurns.get(input.thread.id);
  if (!activeTurn) {
    return runQueuedTurn({
      threadId: input.thread.id,
      run: (controller) => executeTurn(input, controller),
    });
  }

  return steerActiveTurn({ activeTurn, input }).then(async () => {
    await slack
      .postEphemeral(
        input.thread.id,
        input.message.author.userId,
        'Got it! Steering conversation.'
      )
      .then(() => undefined)
      .catch(() => undefined);
  });
}

export function stopTurn({ threadId }: { threadId: string }): boolean {
  const activeTurn = activeTurns.get(threadId);
  if (!activeTurn) {
    return false;
  }
  activeTurn.controller.abort();
  return true;
}

export function stopAllTurns(): void {
  for (const activeTurn of activeTurns.values()) {
    activeTurn.controller.abort();
  }
}

async function executeTurn(
  { message, thread }: { message: Message; thread: Thread },
  controller: AbortController
): Promise<void> {
  const threadId = thread.id;
  logger.info({ text: message.text, threadId }, '[agent] turn started');
  const activeTurn: ActiveTurn = {
    controller,
    pendingMessages: [],
  };
  activeTurns.set(threadId, activeTurn);
  await setThinking(thread);

  let session: Awaited<ReturnType<typeof openSession>> | undefined;
  let activeAttempt: PiAttempt | undefined;
  let controls: Awaited<ReturnType<typeof postTurnControls>> = null;
  let sandboxContext: SandboxContext | undefined;
  let completion: { finishReason: string; textLength: number } | undefined;
  let lineReply = createLineReply({ threadId });

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
    await lineReply.flush({ thread });
    await deleteTurnControls({ controls });
    await parkSession({ pause: true });
    logger.info(
      { ...completion, attempt: attemptLog(activeAttempt), threadId },
      '[agent] turn complete'
    );
  } catch (error) {
    if (controller.signal.aborted) {
      logger.info({ threadId }, '[agent] turn interrupted');
      await deleteTurnControls({ controls });
      await parkSession({ pause: false });
    } else {
      logger.error(
        { attempt: attemptLog(activeAttempt), err: error, threadId },
        '[agent] turn failed'
      );
      await parkSession({ pause: true });
      await deleteTurnControls({ controls });
      await thread.post(agentErrorMessage(error));
    }
  } finally {
    const fallbackInput = activeTurn.pendingMessages.at(-1);
    if (activeTurns.get(threadId) === activeTurn) {
      activeTurns.delete(threadId);
    }
    if (fallbackInput) {
      runTurn(fallbackInput).catch((error: unknown) => {
        logger.error(
          { err: error, threadId },
          '[agent] failed to run fallback steered turn'
        );
      });
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
          onPromptControl: (control) => {
            setPromptControl({ activeTurn, control, threadId });
          },
          onSandboxReady: async (context) => {
            sandboxContext = context;
            attachments = await seedAttachments({
              message,
              sandboxContext: context,
            });
          },
          sandbox,
          sessionId: threadId,
          systemPrompt: systemPrompt(hints),
          tools: buildTools({
            bot,
            getSandboxContext: () => sandboxContext,
            message,
            thread,
          }),
        });
        session = await openSession({ agent, threadId });
        lineReply = createLineReply({ threadId });
        const result = await agent.stream({
          abortSignal: controller.signal,
          prompt: promptWithAttachments({
            attachments,
            text: message.text,
          }),
          session,
        });
        for await (const chunk of renderStream({
          onTextDelta: async (text) => {
            hasStreamed = true;
            controls ??= await postTurnControls({ thread });
            await lineReply.append({ text, thread });
          },
          stream: result.fullStream,
        })) {
          hasStreamed = true;
          yield chunk;
          controls ??= await postTurnControls({ thread });
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
          if (!(controller.signal.aborted || hasStreamed)) {
            logger.warn(
              {
                attempts: chatAttempts.map(attemptLog),
                failures: attemptHistory.map((failure) =>
                  attemptLog(failure.attempt)
                ),
                threadId,
              },
              '[agent] attempt failed, no fallback attempt available'
            );
          }
          throw error;
        }
        logger.warn(
          {
            attempt: attemptLog(currentAttempt),
            err: error,
            nextAttempt: attemptLog(retryAttempt),
            threadId,
          },
          retryAttempt.provider === currentAttempt.provider &&
            retryAttempt.model === currentAttempt.model
            ? '[agent] attempt failed, retrying same model'
            : '[agent] attempt failed, falling back'
        );
        await session?.detach().catch(() => undefined);
        session = undefined;
        if (
          retryAttempt.provider === currentAttempt.provider &&
          retryAttempt.model === currentAttempt.model
        ) {
          const delayMs = attemptDelayMs({
            attempt: currentAttempt,
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
