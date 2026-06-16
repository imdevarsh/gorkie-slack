import path from 'node:path';
import type { HarnessAgentResumeSessionState } from '@ai-sdk/harness/agent';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { getByThread } from '@repo/db/queries';
import type { SandboxContext } from '../types';

const PI_SESSIONS_DIR = '.pi-sessions';

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

function sessionPath({
  name,
  sessionWorkDir,
}: {
  name: string;
  sessionWorkDir: string;
}): string {
  return `${sessionWorkDir}/${PI_SESSIONS_DIR}/${name}`;
}

export async function getSessionFile({
  file,
  source,
}: {
  file: string;
  source: SandboxContext;
}): Promise<{ data: string; file: string } | undefined> {
  const bytes = await source.session.readBinaryFile({
    path: sessionPath({ name: file, sessionWorkDir: source.sessionWorkDir }),
  });
  return bytes ? { data: new TextDecoder().decode(bytes), file } : undefined;
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
  if (!existing?.session) {
    return;
  }
  const sessionFilePath = sessionPath({
    name: existing.session.file,
    sessionWorkDir,
  });
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
    content: existing.session.data,
    path: sessionFilePath,
  });
}
