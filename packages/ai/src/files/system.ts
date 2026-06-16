import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function writeSystemPrompt({
  sessionId,
  systemPrompt,
}: {
  sessionId: string;
  systemPrompt: string;
}): Promise<void> {
  const hostSafeSessionId = sessionId.replace(/[/: ]/g, '-');
  const hostWorkdir = path.join(
    tmpdir(),
    'ai-sdk-harness',
    'pi',
    hostSafeSessionId
  );
  const agentDir = path.join(hostWorkdir, 'agent');
  await mkdir(agentDir, { recursive: true });
  await writeFile(path.join(agentDir, 'SYSTEM.md'), systemPrompt);
}
