import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Pi only fully replaces its base prompt from host SYSTEM.md. `instructions`
// only augments it, and HackClub rejects Pi's default prompt. This mirrors the
// harness's private tmp layout: <tmp>/ai-sdk-harness/pi/<session>/agent/SYSTEM.md.
// TODO: replace this path reconstruction if Harness exposes the host agent dir.
export async function writeSystemPrompt({
  sessionId,
  systemPrompt,
}: {
  sessionId: string;
  systemPrompt: string;
}): Promise<void> {
  const hostSafeSessionId = sessionId.replace(/[/: ]/g, '-');
  const agentDir = path.join(
    tmpdir(),
    'ai-sdk-harness',
    'pi',
    hostSafeSessionId,
    'agent'
  );
  await mkdir(agentDir, { recursive: true });
  await writeFile(path.join(agentDir, 'SYSTEM.md'), systemPrompt);
}
