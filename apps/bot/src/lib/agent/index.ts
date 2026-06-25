import {
  chatAttempts,
  createAgent,
  openSession,
  type PiAttempt,
  persistSession,
  type SandboxContext,
  systemPrompt,
} from '@repo/ai';
import { loadSkills } from '@repo/sandbox';
import { type Message, StreamingPlan, type Thread } from 'chat';
import { deleteControls, postControls } from '@/lib/agent/controls';
import { buildPrompt } from '@/lib/agent/prompt';
import { createReply } from '@/lib/agent/reply';
import { sandbox } from '@/lib/agent/sandbox';
import {
  abortReasonOf,
  interruptTurn,
  queuedInput,
} from '@/lib/agent/steering';
import { clearTurn, getTurn, setTurn } from '@/lib/agent/turns';
import { startThinking } from '@/lib/agent/utils';
import { promptWithAttachments, seedAttachments } from '@/lib/ai/attachments';
import { nextAttempt } from '@/lib/ai/attempts';
import { requestHints } from '@/lib/ai/hints';
import { renderStream } from '@/lib/ai/stream';
import { buildTools } from '@/lib/ai/toolset';
import { runQueuedTurn } from '@/lib/ai/turn-queue';
import { bot, slack } from '@/lib/chat';
import { agentErrorMessage } from '@/lib/errors';
import logger from '@/lib/logger';
import { errorMessage } from '@/lib/utils/error';
import type { ActiveTurn, AgentErrorStage } from '@/types/agent';
import type { AttemptFailure } from '@/types/attempts';

export { compactTurn } from '@/lib/agent/compaction';
export { stopAllTurns, stopTurn } from '@/lib/agent/turns';

export function runTurn(input: {
  message: Message;
  thread: Thread;
}): Promise<void> {
  const turn = getTurn({ threadId: input.thread.id });
  if (!turn) {
    return runQueuedTurn({
      threadId: input.thread.id,
      run: (controller) => executeTurn(input, controller),
    });
  }

  interruptTurn({ activeTurn: turn, input });
  return slack
    .addReaction(input.thread.id, input.message.id, 'white_check_mark')
    .catch(() => undefined);
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
  setTurn({ threadId, turn: activeTurn });
  await startThinking({ thread });
  const hints = await requestHints({ thread, message });

  let session: Awaited<ReturnType<typeof openSession>> | undefined;
  let activeAttempt: PiAttempt | undefined;
  let controls: Awaited<ReturnType<typeof postControls>> = null;
  let sandboxContext: SandboxContext | undefined;
  let reply: ReturnType<typeof createReply> | undefined;
  let errorStage: AgentErrorStage = 'before_output';

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
    if (!session) {
      throw new Error('Agent turn ended before session was recorded.');
    }
    await reply?.flush({ thread });
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
      { attempt: attemptLog(activeAttempt), threadId },
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
      await reply?.flush({ thread });
      await parkSession({ pause: true });
      await deleteControls({ controls });
      await thread.post(agentErrorMessage({ error, stage: errorStage }));
    }
  } finally {
    clearTurn({ threadId, turn: activeTurn });
    // Only an interrupt replays queued messages; a rapid burst is merged into a
    // single follow-up so steering does not drop intermediate corrections.
    const resume =
      abortReasonOf(controller.signal) === 'interrupt'
        ? queuedInput(activeTurn)
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
    const messageText = await buildPrompt(message, {
      customizationPrompt: hints.customization?.prompt,
    });
    let attachments: Awaited<ReturnType<typeof seedAttachments>> = [];
    let streamed = false;
    const attempts: AttemptFailure[] = [];
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
        reply = createReply({ threadId });
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
            streamed = true;
            errorStage = 'after_text';
            controls ??= await postControls({ thread });
            await reply?.append({ text, thread });
          },
          stream: result.stream,
        })) {
          streamed = true;
          if (errorStage === 'before_output') {
            errorStage = 'after_progress';
          }
          yield chunk;
          controls ??= await postControls({ thread });
        }

        return;
      } catch (error) {
        attempts.push({ attempt: currentAttempt, error });
        const retryAttempt = nextAttempt({
          attempts: chatAttempts,
          failures: attempts,
        });
        if (controller.signal.aborted || streamed || !retryAttempt) {
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
