import type { HarnessAgentSession } from '@ai-sdk/harness/agent';
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
  let resumeFrom = existing?.resumeState
    ? JSON.parse(existing.resumeState)
    : undefined;
  if (resumeFrom && 'continueFrom' in resumeFrom) {
    const { continueFrom: _continueFrom, ...cleanedResumeFrom } = resumeFrom;
    resumeFrom = cleanedResumeFrom;
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
  // Pi writes its transcript during detach; mirror it before the sandbox pauses.
  const detachedResumeState = await session.detach();
  const resumeState =
    'continueFrom' in detachedResumeState
      ? (({ continueFrom: _continueFrom, ...cleanedResumeState }) =>
          cleanedResumeState)(detachedResumeState)
      : detachedResumeState;
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
