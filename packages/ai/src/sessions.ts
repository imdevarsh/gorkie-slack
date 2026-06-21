import type {
  HarnessAgentResumeSessionState,
  HarnessAgentSession,
} from '@ai-sdk/harness/agent';
import { getByThread, updateResumeState } from '@repo/db/queries';
import type { Agent } from './agent';
import { getSessionFile, sessionFileNameOf } from './files/session';
import type { SandboxContext } from './types';

export async function openSession({
  agent,
  threadId,
}: {
  agent: Agent;
  threadId: string;
}): Promise<HarnessAgentSession> {
  const existing = await getByThread(threadId);
  const stored: HarnessAgentResumeSessionState | undefined =
    existing?.resumeState ? JSON.parse(existing.resumeState) : undefined;
  return await agent.createSession(
    stored
      ? { resumeFrom: stored, sessionId: threadId }
      : { sessionId: threadId }
  );
}

export async function persistSession({
  session,
  snapshotSource,
  threadId,
}: {
  session: HarnessAgentSession;
  snapshotSource?: SandboxContext;
  threadId: string;
}): Promise<void> {
  // Pi writes its transcript during detach; mirror it before the sandbox pauses.
  const resumeState = await session.detach();
  const serialized = JSON.stringify(resumeState);

  const file = sessionFileNameOf(resumeState);
  const snapshot =
    file && snapshotSource
      ? await getSessionFile({ file, source: snapshotSource })
      : undefined;

  await updateResumeState({
    resumeState: serialized,
    session: snapshot,
    threadId,
  });
}
