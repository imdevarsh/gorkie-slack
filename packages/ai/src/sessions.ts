import type { HarnessAgentSession } from '@ai-sdk/harness/agent';
import { getByThread, updateResumeState } from '@repo/db/queries';
import type { Agent } from './agent';

export async function openSession({
  agent,
  threadId,
}: {
  agent: Agent;
  threadId: string;
}): Promise<HarnessAgentSession> {
  const existing = await getByThread(threadId);
  const resumeFrom = existing?.resumeState
    ? JSON.parse(existing.resumeState)
    : undefined;
  return await agent.createSession(
    resumeFrom ? { resumeFrom, sessionId: threadId } : { sessionId: threadId }
  );
}

export async function persistSession({
  session,
  threadId,
}: {
  session: HarnessAgentSession;
  threadId: string;
}): Promise<void> {
  const resumeState = await session.detach();
  await updateResumeState({
    resumeState: JSON.stringify(resumeState),
    status: 'paused',
    threadId,
  });
}
