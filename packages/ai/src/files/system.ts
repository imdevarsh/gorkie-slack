import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Writes gorkie's prompt to pi's host agent dir as SYSTEM.md, which pi's
// resource loader discovers and uses to FULLY REPLACE its base system prompt.
// This is deliberate, not just decoration: HackClub AI 403s pi's default
// "You are pi … read/write/edit …" prompt, so we must override it outright.
// The harness `instructions` option only AUGMENTS (pi frames it into the user
// message) — it would not remove the blocked base prompt. Don't "simplify"
// this into `instructions`; it silently re-breaks HackClub.
//
// pi runs on the host and reads SYSTEM.md from the host fs, so we reconstruct
// the host agent dir the harness derives internally:
//   tmpdir()/ai-sdk-harness/pi/<safeSessionId>/agent/SYSTEM.md
// where safeSessionId = sessionId with /, :, space → '-', matching pi core.
// The sessionId is the real one we pass to createSession (the thread id); only
// the host path layout is reconstructed.
//
// TODO: drop this tmpdir() reconstruction (and the sanitising) if the AI SDK
// ever exposes the host agent dir directly — today onSandboxSession only gives
// the sandbox sessionWorkDir, not this host path.
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
