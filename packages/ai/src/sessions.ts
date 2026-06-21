import type {
  HarnessAgentResumeSessionState,
  HarnessAgentSession,
} from '@ai-sdk/harness/agent';
import { getByThread, updateResumeState } from '@repo/db/queries';
import type { Agent } from './agent';
import { getSessionFile, sessionFileNameOf } from './files/session';
import type { SandboxContext } from './types';

function resumeState(
  state: HarnessAgentResumeSessionState
): HarnessAgentResumeSessionState {
  const { continueFrom: _continueFrom, ...resumeState } = state;
  return resumeState;
}

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
  const resumeFrom = stored ? resumeState(stored) : undefined;
  if (stored?.continueFrom !== undefined) {
    await updateResumeState({
      resumeState: JSON.stringify(resumeFrom),
      threadId,
    });
  }
  return await agent.createSession(
    resumeFrom ? { resumeFrom, sessionId: threadId } : { sessionId: threadId }
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
  const state = resumeState(await session.detach());
  const serialized = JSON.stringify(state);

  const file = sessionFileNameOf(state);
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
