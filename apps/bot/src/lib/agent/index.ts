import {
  chatAttempts,
  createAgent,
  openSession,
  type PiAttempt,
  persistSession,
  type SandboxContext,
  systemPrompt,
} from '@repo/ai';
import { E2BSandboxProvider, loadSkills } from '@repo/sandbox';
import { type Message, StreamingPlan, type Thread } from 'chat';
import { env } from '@/env';
import { deleteControls, postControls } from '@/lib/agent/controls';
import { createLineReply } from '@/lib/agent/line-reply';
import { buildAgentPromptText } from '@/lib/agent/prompt';
import {
  type ActiveTurn,
  abortReasonOf,
  interruptTurn,
  TurnAbort,
} from '@/lib/agent/steering';
import { promptWithAttachments, seedAttachments } from '@/lib/ai/attachments';
import { type AttemptFailure, nextAttempt } from '@/lib/ai/attempts';
import { requestHints } from '@/lib/ai/hints';
import { renderStream } from '@/lib/ai/stream';
import { buildTools } from '@/lib/ai/toolset';
import { runQueuedTurn } from '@/lib/ai/turn-queue';
import { bot, slack } from '@/lib/chat';
import { agentErrorMessage } from '@/lib/errors';
import logger from '@/lib/logger';
import { errorMessage } from '@/lib/utils/error';

const activeTurns = new Map<string, ActiveTurn>();

const sandbox = new E2BSandboxProvider({
  apiKey: env.E2B_API_KEY,
  env: {
    ...(env.AGENTMAIL_API_KEY
      ? { AGENTMAIL_API_KEY: env.AGENTMAIL_API_KEY }
      : {}),
  },
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

  interruptTurn({ activeTurn, input });
  return slack
    .addReaction(input.thread.id, input.message.id, 'white_check_mark')
    .catch(() => undefined);
}

export function stopTurn({ threadId }: { threadId: string }): boolean {
  const activeTurn = activeTurns.get(threadId);
  if (!activeTurn) {
    return false;
  }
  activeTurn.controller.abort(new TurnAbort('stop'));
  return true;
}

export function stopAllTurns(): void {
  for (const activeTurn of activeTurns.values()) {
    activeTurn.controller.abort(new TurnAbort('shutdown'));
  }
}

// Compaction is queued like a turn so it never races an in-flight response on
// the same thread; the runtime (Pi) compacts its session in place, and we
// persist the smaller transcript so the next turn resumes from it.
export function compactTurn(input: {
  instructions?: string;
  message: Message;
  thread: Thread;
}): Promise<void> {
  return runQueuedTurn({
    threadId: input.thread.id,
    run: () => executeCompact(input),
  });
}

async function executeCompact({
  instructions,
  message,
  thread,
}: {
  instructions?: string;
  message: Message;
  thread: Thread;
}): Promise<void> {
  const threadId = thread.id;
  const attempt = chatAttempts[0];
  if (!attempt) {
    logger.error({ threadId }, '[agent] no model configured for compaction');
    return;
  }
  logger.info({ threadId }, '[agent] compaction started');
  await thread.startTyping('is compacting');

  const hints = await requestHints({ thread, message });
  const skills = await loadSkills();
  let sandboxContext: SandboxContext | undefined;
  const agent = createAgent({
    attempt,
    onSandboxReady: (context) => {
      sandboxContext = context;
    },
    sandbox,
    sessionId: threadId,
    skills,
    systemPrompt: systemPrompt({ hints }),
    tools: buildTools({
      bot,
      getSandboxContext: () => sandboxContext,
      message,
      thread,
    }),
  });

  let session: Awaited<ReturnType<typeof openSession>> | undefined;
  try {
    session = await openSession({ agent, threadId });
    await session.compact(instructions);
    await persistSession({ session, snapshotSource: sandboxContext, threadId });
    await sandbox.pauseSession({ threadId });
    logger.info({ threadId }, '[agent] compaction complete');
    await thread
      .post({ markdown: '🧹 Compacted this thread’s context.' })
      .catch(() => undefined);
  } catch (error) {
    logger.error({ err: error, threadId }, '[agent] compaction failed');
    await session?.detach().catch(() => undefined);
    await thread.post(agentErrorMessage(error)).catch(() => undefined);
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
  await thread.startTyping('is thinking');
  const hints = await requestHints({ thread, message });

  let session: Awaited<ReturnType<typeof openSession>> | undefined;
  let activeAttempt: PiAttempt | undefined;
  let controls: Awaited<ReturnType<typeof postControls>> = null;
  let sandboxContext: SandboxContext | undefined;
  let completion: { finishReason: string; textLength: number } | undefined;
  let lineReply: ReturnType<typeof createLineReply> | undefined;

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
      await sandbox.pauseSession({ threadId });
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
    await lineReply?.flush({ thread });
    if (hints.customization?.prompt && !slack.isDM(thread.id)) {
      await thread
        .post({
          markdown:
            "_gorkie's responses are shaped by this user's instructions_",
        })
        .catch(() => undefined);
    }
    await deleteControls({ controls });
    await parkSession({ pause: true });
    logger.info(
      { ...completion, attempt: attemptLog(activeAttempt), threadId },
      '[agent] turn complete'
    );
  } catch (error) {
    const reason = abortReasonOf(controller.signal);
    if (reason) {
      logger.info({ reason, threadId }, '[agent] turn interrupted');
      await deleteControls({ controls });
      // An interrupt restarts immediately, so leave the sandbox warm; stop and
      // shutdown end the turn, so pause it. The transcript is persisted either
      // way, so the follow-up resumes with full context.
      await parkSession({ pause: reason !== 'interrupt' });
    } else {
      logger.error(
        { attempt: attemptLog(activeAttempt), err: error, threadId },
        '[agent] turn failed'
      );
      await parkSession({ pause: true });
      await deleteControls({ controls });
      await thread.post(agentErrorMessage(error));
    }
  } finally {
    if (activeTurns.get(threadId) === activeTurn) {
      activeTurns.delete(threadId);
    }
    // Only an interrupt replays a queued message; a rapid burst keeps the latest
    // (later messages supersede the earlier ones within the same wind-down).
    const resume =
      abortReasonOf(controller.signal) === 'interrupt'
        ? activeTurn.pendingMessages.at(-1)
        : undefined;
    if (resume) {
      runTurn(resume).catch((error: unknown) => {
        logger.error(
          { err: error, threadId },
          '[agent] failed to run interrupted follow-up turn'
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
    const skills = await loadSkills();
    const messageText = await buildAgentPromptText(message);
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
            await context.session.writeBinaryFile({
              content: new Uint8Array(),
              path: `${context.sessionWorkDir}/output/.keep`,
            });
            attachments = await seedAttachments({
              message,
              sandboxContext: context,
            });
          },
          sandbox,
          sessionId: threadId,
          skills,
          systemPrompt: systemPrompt({ hints }),
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
            text: messageText,
          }),
          session,
        });
        for await (const chunk of renderStream({
          onTextDelta: async (text) => {
            hasStreamed = true;
            controls ??= await postControls({ thread });
            await lineReply?.append({ text, thread });
          },
          stream: result.stream,
        })) {
          hasStreamed = true;
          yield chunk;
          controls ??= await postControls({ thread });
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
          failures: attemptHistory,
        });
        if (controller.signal.aborted || hasStreamed || !retryAttempt) {
          throw error;
        }
        logger.warn(
          {
            attempt: attemptLog(currentAttempt),
            err: errorMessage(error),
            nextAttempt: attemptLog(retryAttempt),
            threadId,
          },
          '[agent] attempt failed, falling back'
        );
        await session?.detach().catch(() => undefined);
        session = undefined;
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
