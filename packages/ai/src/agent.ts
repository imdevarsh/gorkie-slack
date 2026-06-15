import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
    permissionMode: 'allow-all',
    sandbox,
    // pi resolves its system prompt from <agentDir>/SYSTEM.md on the *host* fs
    // (pi runs on the host, not the sandbox) and HackClub 403s pi's default
    // prompt, so replace it before pi boots. The harness derives agentDir as
    // tmpdir()/ai-sdk-harness/pi/<safeSessionId>/agent and hands us a
    // sessionWorkDir of `<workdir>/pi-<sessionId>`; recover sessionId from its
    // basename to rebuild the same path (one shared agent, no per-call closure).
    onSandboxSession: async ({ sessionWorkDir }) => {
      const sessionId = path.posix.basename(sessionWorkDir).replace(/^pi-/, '');
      const safeSessionId = sessionId.replace(/[\\/: ]/g, '-');
      const agentDir = path.join(
        tmpdir(),
        'ai-sdk-harness',
        'pi',
        safeSessionId,
        'agent'
      );
      await mkdir(agentDir, { recursive: true });
      await writeFile(path.join(agentDir, 'SYSTEM.md'), buildSystemPrompt());
    },
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

// `paused` pauses the sandbox (e2b betaPause); `active` keeps it warm.
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
