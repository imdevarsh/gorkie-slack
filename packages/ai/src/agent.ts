import type { HarnessV1SandboxProvider } from '@ai-sdk/harness';
import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
  type HarnessAgentSession,
} from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { getByThread, updateResumeState } from '@repo/db/queries';
import { modelConfig } from './config';
import { buildSystemPrompt } from './prompt';

// One HarnessAgent is reused across threads; per-thread state lives in sessions.
// Part 1 uses a single shared HackClub key; per-user BYOK arrives in Phase 5.
export function createGorkieAgent({
  apiKey,
  sandbox,
}: {
  apiKey: string;
  sandbox: HarnessV1SandboxProvider;
}) {
  return new HarnessAgent({
    harness: createPi({
      auth: {
        customEnv: {
          OPENROUTER_API_KEY: apiKey,
          OPENROUTER_BASE_URL: modelConfig.baseUrl,
        },
      },
      model: modelConfig.modelId,
      thinkingLevel: modelConfig.thinkingLevel,
    }),
    id: 'gorkie',
    instructions: buildSystemPrompt(),
    permissionMode: 'allow-all',
    sandbox,
  });
}

export type GorkieAgent = ReturnType<typeof createGorkieAgent>;

function parseResumeState(
  value: string | null
): HarnessAgentResumeSessionState | undefined {
  return value
    ? (JSON.parse(value) as HarnessAgentResumeSessionState)
    : undefined;
}

// Resume the thread's harness session (or start fresh), keyed by Slack thread id.
export async function openSession({
  agent,
  threadId,
}: {
  agent: GorkieAgent;
  threadId: string;
}): Promise<HarnessAgentSession> {
  const existing = await getByThread(threadId);
  const resumeFrom = parseResumeState(existing?.resumeState ?? null);
  return await agent.createSession(
    resumeFrom ? { resumeFrom, sessionId: threadId } : { sessionId: threadId }
  );
}

// End the turn and persist the updated resume state. `paused` also pauses the
// sandbox (e2b betaPause); `active` keeps it warm.
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
  await updateResumeState({
    resumeState: JSON.stringify(resumeState),
    status,
    threadId,
  });
}
