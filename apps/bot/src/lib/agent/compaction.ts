import {
  chatAttempts,
  createAgent,
  openSession,
  persistSession,
  type SandboxContext,
  systemPrompt,
} from '@repo/ai';
import { loadSkills } from '@repo/sandbox';
import type { Message, Thread } from 'chat';
import { sandbox } from '@/lib/agent/sandbox';
import { requestHints } from '@/lib/ai/hints';
import { buildTools } from '@/lib/ai/toolset';
import { runQueuedTurn } from '@/lib/ai/turn-queue';
import { bot } from '@/lib/chat';
import { agentErrorMessage } from '@/lib/errors';
import logger from '@/lib/logger';

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
      .post({ markdown: "compacted this thread's context." })
      .catch(() => undefined);
  } catch (error) {
    logger.error({ err: error, threadId }, '[agent] compaction failed');
    await session?.detach().catch(() => undefined);
    await thread.post(agentErrorMessage({ error })).catch(() => undefined);
  }
}
