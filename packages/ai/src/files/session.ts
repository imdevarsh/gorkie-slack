import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { HarnessAgentResumeSessionState } from '@ai-sdk/harness/agent';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { getByThread } from '@repo/db/queries';
import { hostWorkdir, PI_SESSIONS_DIR } from './utils';

export function sessionIdFromWorkDir(sessionWorkDir: string): string {
  return path.posix.basename(sessionWorkDir).replace(/^pi-/, '');
}

export function sessionFileNameOf(
  resumeState: HarnessAgentResumeSessionState
): string | undefined {
  const { data } = resumeState;
  if (data && typeof data === 'object' && 'sessionFileName' in data) {
    const name = data.sessionFileName;
    return typeof name === 'string' ? name : undefined;
  }
  return;
}

export function readSession({
  sessionFileName,
  sessionId,
}: {
  sessionFileName: string;
  sessionId: string;
}): Promise<string | null> {
  const hostPath = path.join(
    hostWorkdir(sessionId),
    'sessions',
    sessionFileName
  );
  return readFile(hostPath, 'utf8').catch(() => null);
}

export async function syncSession({
  abortSignal,
  session,
  sessionId,
  sessionWorkDir,
}: {
  abortSignal?: AbortSignal;
  session: Experimental_SandboxSession;
  sessionId: string;
  sessionWorkDir: string;
}): Promise<void> {
  const existing = await getByThread(sessionId);
  if (!(existing?.sessionFile && existing.sessionFileName)) {
    return;
  }
  const sessionFilePath = `${sessionWorkDir}/${PI_SESSIONS_DIR}/${existing.sessionFileName}`;
  const hasSessionFile = await session
    .readTextFile({ abortSignal, path: sessionFilePath })
    .then(
      (content) => content !== null,
      () => false
    );
  if (hasSessionFile) {
    return;
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
}
