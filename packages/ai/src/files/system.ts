import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hostWorkdir } from './utils';

export async function writeSystemPrompt({
  sessionId,
  systemPrompt,
}: {
  sessionId: string;
  systemPrompt: string;
}): Promise<void> {
  const agentDir = path.join(hostWorkdir(sessionId), 'agent');
  await mkdir(agentDir, { recursive: true });
  await writeFile(path.join(agentDir, 'SYSTEM.md'), systemPrompt);
}
