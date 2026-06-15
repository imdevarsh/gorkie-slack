import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

const PI_SESSIONS_DIR = '.pi-sessions';

// The harness lays pi's host files under tmpdir()/ai-sdk-harness/pi/<safeSessionId>.
function piHostRoot(sessionId: string): string {
  const safeSessionId = sessionId.replace(/[\\/: ]/g, '-');
  return path.join(tmpdir(), 'ai-sdk-harness', 'pi', safeSessionId);
}

// sessionWorkDir is `<workdir>/pi-<sessionId>`.
function sessionIdFromWorkDir(sessionWorkDir: string): string {
  return path.posix.basename(sessionWorkDir).replace(/^pi-/, '');
}

function sessionFileNameOf(
  resumeState: HarnessAgentResumeSessionState
): string | undefined {
  const { data } = resumeState;
  if (data && typeof data === 'object' && 'sessionFileName' in data) {
    const name = data.sessionFileName;
    return typeof name === 'string' ? name : undefined;
  }
  return;
}

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
    onSandboxSession: async ({ abortSignal, session, sessionWorkDir }) => {
      const sessionId = sessionIdFromWorkDir(sessionWorkDir);

      // HackClub 403s pi's default prompt, so replace it via <agentDir>/SYSTEM.md
      // on the host fs before pi boots.
      const agentDir = path.join(piHostRoot(sessionId), 'agent');
      await mkdir(agentDir, { recursive: true });
      await writeFile(path.join(agentDir, 'SYSTEM.md'), systemPrompt);

      // Re-seed pi's mirrored transcript when the sandbox is fresh (the previous
      // one was killed), so the conversation survives. A reconnected sandbox
      // already has the file, so we only write when it's missing — then pi pulls
      // it on resume.
      const existing = await getByThread(sessionId);
      if (!(existing?.sessionFile && existing.sessionFileName)) {
        return;
      }
      const sessionFilePath = `${sessionWorkDir}/${PI_SESSIONS_DIR}/${existing.sessionFileName}`;
      try {
        await session.readTextFile({ abortSignal, path: sessionFilePath });
        return;
      } catch {
        // Missing in this sandbox — re-seed it below.
      }
      await session.run({
        abortSignal,
        command: `mkdir -p ${JSON.stringify(`${sessionWorkDir}/${PI_SESSIONS_DIR}`)}`,
      });
      await session.writeTextFile({
        abortSignal,
        content: existing.sessionFile,
        path: sessionFilePath,
      });
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

// Read pi's live session file from the host so we can mirror it to Postgres.
function readHostSessionFile(
  sessionId: string,
  sessionFileName: string
): Promise<string | null> {
  const hostPath = path.join(
    piHostRoot(sessionId),
    'sessions',
    sessionFileName
  );
  return readFile(hostPath, 'utf8').catch(() => null);
}

// `paused` pauses the sandbox (e2b betaPause); `active` keeps it warm. Either
// way we mirror pi's transcript so the thread survives the sandbox being killed.
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
    ? await readHostSessionFile(threadId, sessionFileName)
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
