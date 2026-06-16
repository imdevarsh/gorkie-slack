import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function piHostRoot(sessionId: string): string {
  const safeSessionId = sessionId.replace(/[/: ]/g, '-');
  return path.join(tmpdir(), 'ai-sdk-harness', 'pi', safeSessionId);
}

export async function writeSystemPrompt({
  sessionId,
  systemPrompt,
}: {
  sessionId: string;
  systemPrompt: string;
}): Promise<void> {
  const agentDir = path.join(piHostRoot(sessionId), 'agent');
  await mkdir(agentDir, { recursive: true });
  await writeFile(path.join(agentDir, 'SYSTEM.md'), systemPrompt);
}
