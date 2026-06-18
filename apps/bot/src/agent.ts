import { deleteSlackMessage, postSlackMessage } from '@chat-adapter/slack/api';
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
import { promptWithAttachments, seedAttachments } from '@/lib/ai/attachments';
import {
  type AttemptFailure,
  attemptDelayMs,
  nextAttempt,
} from '@/lib/ai/attempts';
import { requestHints } from '@/lib/ai/hints';
import { type RenderStreamState, renderStream } from '@/lib/ai/stream';
import { buildTools } from '@/lib/ai/toolset';
import { runQueuedTurn } from '@/lib/ai/turn-queue';
import { bot, slack } from '@/lib/chat';
import { agentErrorMessage } from '@/lib/errors';
import logger from '@/lib/logger';
import { getThread, setThinking } from '@/lib/slack/thread';

export const STOP_TURN_ACTION = 'gorkie_stop_turn';

const activeTurns = new Map<string, AbortController>();
const turnVersions = new Map<string, symbol>();
const SLACK_FOLLOW_UP_TEXT_MAX = 30_000;

const sandbox = new E2BSandboxProvider({
  apiKey: env.E2B_API_KEY,
  logger,
});

interface SlackControlMessage {
  channel: string;
  ts: string;
}

function stopBlocks({ threadId }: { threadId: string }): unknown[] {
  return [
    {
      elements: [
        {
          action_id: STOP_TURN_ACTION,
          style: 'danger',
          text: { text: 'Stop', type: 'plain_text' },
          type: 'button',
          value: threadId,
        },
      ],
      type: 'actions',
    },
  ];
}

async function postControlMessage({
  thread,
}: {
  thread: Thread;
}): Promise<SlackControlMessage | null> {
  const slackThread = getThread(thread);
  if (!slackThread) {
    return null;
  }

  const posted = await postSlackMessage({
    blocks: stopBlocks({ threadId: thread.id }),
    channel: slackThread.channel,
    text: 'Gorkie is responding...',
    threadTs: slackThread.threadTs,
    token: env.SLACK_BOT_TOKEN,
  }).catch((error: unknown) => {
    logger.warn(
      { err: error, threadId: thread.id },
      'Failed to post stop button'
    );
    return null;
  });

  return posted?.channel ? { channel: posted.channel, ts: posted.id } : null;
}

async function deleteControlMessage({
  control,
}: {
  control: SlackControlMessage | null;
}): Promise<void> {
  if (!control) {
    return;
  }

  await deleteSlackMessage({
    channel: control.channel,
    token: env.SLACK_BOT_TOKEN,
    ts: control.ts,
  }).catch(() => undefined);
}

function splitSlackFollowUpText(text: string): string[] {
  const chunks: string[] = [];
  let current = '';
  const lines = text.match(/[^\n]*\n|[^\n]+/g) ?? [];

  for (const line of lines) {
    if (line.length > SLACK_FOLLOW_UP_TEXT_MAX) {
      if (current) {
        chunks.push(current.trimEnd());
        current = '';
      }
      for (
        let index = 0;
        index < line.length;
        index += SLACK_FOLLOW_UP_TEXT_MAX
      ) {
        chunks.push(line.slice(index, index + SLACK_FOLLOW_UP_TEXT_MAX));
      }
      continue;
    }

    if (current.length + line.length > SLACK_FOLLOW_UP_TEXT_MAX) {
      chunks.push(current.trimEnd());
      current = line;
      continue;
    }

    current += line;
  }

  if (current.trim()) {
    chunks.push(current.trimEnd());
  }

  return chunks;
}

export function runTurn(input: {
  message: Message;
  thread: Thread;
}): Promise<void> {
  const threadId = input.thread.id;
  const turnToken = Symbol(threadId);
  turnVersions.set(threadId, turnToken);
  activeTurns.get(threadId)?.abort();

  return runQueuedTurn({
    threadId,
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
    run: (controller) => executeTurn(input, controller, turnToken),
  });
}

export function stopTurn({ threadId }: { threadId: string }): boolean {
  const controller = activeTurns.get(threadId);
  if (!controller) {
    return false;
  }
  controller.abort();
  return true;
}

async function executeTurn(
  { message, thread }: { message: Message; thread: Thread },
  controller: AbortController,
  turnToken: symbol
): Promise<void> {
  const threadId = thread.id;
  const isCurrentTurn = () => turnVersions.get(threadId) === turnToken;
  logger.info({ text: message.text, threadId }, '[agent] turn started');
  activeTurns.set(threadId, controller);
  await setThinking(thread);

  let session: Awaited<ReturnType<typeof openSession>> | undefined;
  let activeAttempt: PiAttempt | undefined;
  let control: SlackControlMessage | null = null;
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
    if (!isCurrentTurn()) {
      await deleteControlMessage({ control });
      return;
    }
    if (!(session && completion)) {
      throw new Error(
        'Agent turn ended before session completion was recorded.'
      );
    }
    await deleteControlMessage({ control });
    await parkSession({ pause: true });
    logger.info(
      { ...completion, attempt: attemptLog(activeAttempt), threadId },
      '[agent] turn complete'
    );
  } catch (error) {
    if (controller.signal.aborted || !isCurrentTurn()) {
      logger.info({ threadId }, '[agent] turn interrupted');
      await deleteControlMessage({ control });
      if (isCurrentTurn()) {
        await parkSession({ pause: false });
      }
    } else {
      logger.error(
        { attempt: attemptLog(activeAttempt), err: error, threadId },
        '[agent] turn failed'
      );
      await parkSession({ pause: true });
      await deleteControlMessage({ control });
      await thread.post(agentErrorMessage(error));
    }
  } finally {
    if (activeTurns.get(threadId) === controller) {
      activeTurns.delete(threadId);
    }
    if (isCurrentTurn()) {
      turnVersions.delete(threadId);
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
      if (!isCurrentTurn()) {
        return;
      }
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
          systemPrompt: systemPrompt({
            ...hints,
            model: currentAttempt.model,
          }),
          tools: buildTools({
            bot,
            getSandboxContext: () => sandboxContext,
            message,
            thread,
          }),
        });
        session = await openSession({ agent, threadId });
        if (!isCurrentTurn()) {
          return;
        }
        const result = await agent.stream({
          abortSignal: controller.signal,
          prompt: promptWithAttachments({
            attachments,
            text: message.text,
          }),
          session,
        });
        const streamState: RenderStreamState = {};
        for await (const chunk of renderStream(
          result.fullStream,
          streamState
        )) {
          hasStreamed = true;
          yield chunk;
          control ??= await postControlMessage({ thread });
        }

        const [text, finishReason] = await Promise.all([
          result.text,
          result.finishReason,
        ]);
        if (
          typeof streamState.truncatedAt === 'number' &&
          text.length > streamState.truncatedAt
        ) {
          for (const chunk of splitSlackFollowUpText(
            text.slice(streamState.truncatedAt).trimStart()
          )) {
            await thread.post(chunk);
          }
        }
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
