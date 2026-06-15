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
import type { ToolSet } from 'ai';
import { CHAT_MODEL_ID, HACKCLUB_BASE_URL } from './providers';

export function createGorkieAgent({
  apiKey,
  sandbox,
  systemPrompt,
  tools,
}: {
  apiKey: string;
  sandbox: HarnessV1SandboxProvider;
  systemPrompt: string;
  tools: ToolSet;
}) {
  return new HarnessAgent({
    harness: createPi({
      auth: {
        customEnv: {
          OPENROUTER_API_KEY: apiKey,
          OPENROUTER_BASE_URL: HACKCLUB_BASE_URL,
        },
      },
      model: CHAT_MODEL_ID,
      thinkingLevel: 'medium',
    }),
    id: 'gorkie',
    permissionMode: 'allow-all',
    sandbox,
    tools,
    // HackClub 403s pi's default prompt, so replace it via <agentDir>/SYSTEM.md
    // on the host fs before pi boots. The harness derives agentDir from the
    // sessionId, which we recover from sessionWorkDir's `pi-<sessionId>` basename.
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
      await writeFile(path.join(agentDir, 'SYSTEM.md'), systemPrompt);
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
