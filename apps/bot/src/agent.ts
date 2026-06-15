import { createGorkieAgent, openSession, persistSession } from '@repo/ai';
import { createE2BSandboxProvider } from '@repo/sandbox';
import type { Message, Thread } from 'chat';
import { env } from '@/env';
import logger from '@/lib/logger';
import { renderHarnessStream } from '@/lib/render-stream';

const sandbox = createE2BSandboxProvider({
  apiKey: env.E2B_API_KEY,
  logger,
});

const agent = createGorkieAgent({
  apiKey: env.HACKCLUB_API_KEY,
  sandbox,
});

// One harness turn for a Slack message: resume the thread's session, stream pi's
// reply straight into the thread, then persist the updated resume state.
export async function runTurn({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<void> {
  const threadId = thread.id;
  logger.info({ text: message.text, threadId }, '[agent] turn started');
  await thread.startTyping().catch(() => undefined);
  const session = await openSession({ agent, threadId });

  try {
    const result = await agent.stream({ prompt: message.text, session });
    await thread.post(renderHarnessStream(result.fullStream));
    const [text, finishReason] = await Promise.all([
      result.text,
      result.finishReason,
    ]);
    await persistSession({
      session,
      status: env.NODE_ENV === 'production' ? 'paused' : 'active',
      threadId,
    });
    logger.info(
      { finishReason, textLength: text.length, threadId },
      '[agent] turn complete'
    );
  } catch (error) {
    logger.error({ err: error, threadId }, '[agent] turn failed');
    await persistSession({ session, status: 'active', threadId }).catch(
      async () => {
        await session.destroy().catch(() => undefined);
      }
    );
    await thread.post('Sorry — something went wrong handling that.');
  }
}
