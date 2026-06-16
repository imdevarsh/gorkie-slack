import type { HarnessAgentSession } from '@ai-sdk/harness/agent';
import { getByThread, updateResumeState } from '@repo/db/queries';
import type { Agent } from './agent';
import { readHostSessionFile, sessionFileNameOf } from './files/session';

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
  status,
  threadId,
}: {
  session: HarnessAgentSession;
  status: 'active' | 'paused';
  threadId: string;
}): Promise<void> {
  const resumeState =
    status === 'paused' ? await session.stop() : await session.detach();
  const serialized = JSON.stringify(resumeState);

  const sessionFileName = sessionFileNameOf(resumeState);
  const sessionFile = sessionFileName
    ? await readHostSessionFile({ sessionId: threadId, sessionFileName })
    : null;

  if (sessionFileName && sessionFile !== null) {
    await updateResumeState({
      resumeState: serialized,
      status,
      threadId,
      sessionFileName,
      sessionFile,
    });
    return;
  }
  await updateResumeState({ resumeState: serialized, status, threadId });
}
